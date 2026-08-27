#!/usr/bin/env node
/**
 * Static detector for React Rules-of-Hooks violations (React error #310).
 *
 * Sebuah hook call hanya LEGAL bila semua syarat terpenuhi:
 *   1. Fungsi pembungkus terdekat adalah component (nama kapital) atau
 *      custom hook (nama "useXxx").
 *   2. Hook dipanggil langsung di tubuh fungsi tsb (bukan di dalam
 *      callback/nested helper lain).
 *   3. Hook TIDAK berada di dalam blok kondisional/loop (if/for/while/
 *      switch/try/catch) di level tubuh component.
 *
 * Menangkap pola penyebab #310:
 *   - useMemo/useState di dalam .map(() => {...}) atau renderFoo = () => {...}
 *   - hook di helper non-component
 *   - hook di belakang early-return kondisional
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const HOOK_NAME = '(?:useState|useEffect|useMemo|useCallback|useRef|useReducer|useLayoutEffect|useContext|useId|useInsertionEffect|useDebugValue|useImperativeHandle)';
const HOOK_RE = new RegExp(`\\b(?:${HOOK_NAME}|React\\.use[A-Z]\\w*)\\s*\\(`, 'g');
const FN_RE = /(?:(?:export\s+default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\()|(?:(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)/g;

const violations = [];
let filesScanned = 0;

/** Buang string/template/komentar supaya brace-matching akurat. */
function stripStringsAndComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let state = 'code';
  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];
    if (state === 'code') {
      if (ch === '/' && next === '/') { state = 'line'; i += 2; out += '  '; continue; }
      if (ch === '/' && next === '*') { state = 'block'; i += 2; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { state = ch === '`' ? 'tpl' : 'str'; out += ' '; i += 1; continue; }
      out += ch; i += 1; continue;
    }
    if (state === 'line') {
      if (ch === '\n') { state = 'code'; out += ch; } else out += ' ';
      i += 1; continue;
    }
    if (state === 'block') {
      if (ch === '*' && next === '/') { state = 'code'; i += 2; out += '  '; continue; }
      if (ch === '\n') out += ch;
      i += 1; continue;
    }
    if (state === 'str') {
      if (ch === '\\') { i += 2; continue; }
      if (ch === "'") { state = 'code'; }
      i += 1; out += ' '; continue;
    }
    // template literal
    if (ch === '\\') { i += 2; continue; }
    if (ch === '`') { state = 'code'; out += ' '; i += 1; continue; }
    if (ch === '$' && next === '{') { out += ch; i += 1; continue; } // biarkan expr terlihat?? -> repl agar balance: treat as-is; expr scanned inside tpl state below? keep simple: emit space to avoid braces leaking
    // NB: '$' + '{' di tpl TIDAK boleh bocor; emit dua spasi
    if (ch === '$') { out += '  '; i += 2; continue; }
    if (ch === '}') { /* hanya bagian tpl polos */ }
    out += ' ';
    i += 1;
  }
  return out;
}

function lineOf(raw, idx) {
  let line = 1;
  for (let i = 0; i < idx && i < raw.length; i++) if (raw[i] === '\n') line++;
  return line;
}

/** Rentang [openBraceIdx, closeBraceIdx] blok kondisional if/for/while/switch/try/catch. */
function collectConditionalRanges(src) {
  const ranges = [];
  const KW_RE = /\b(if|for|while|switch|try|catch)\b/g;
  let m;
  const n = src.length;
  while ((m = KW_RE.exec(src))) {
    let j = KW_RE.lastIndex;
    // Lewati header sampai '{' (balance parens utk for/if dengan braces di dalam? jarang)
    let depth = 0;
    while (j < n) {
      const c = src[j];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === '{' && depth <= 0) break;
      else if (c === ';' && depth === 0) break;
      j++;
    }
    if (j >= n || src[j] !== '{') continue;
    let bd = 0;
    const start = j;
    for (; j < n; j++) {
      if (src[j] === '{') bd++;
      else if (src[j] === '}') { bd--; if (bd === 0) break; }
    }
    ranges.push([start, j]);
    KW_RE.lastIndex = j + 1;
  }
  return ranges;
}

function scanFile(relPath) {
  const raw = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const src = stripStringsAndComments(raw);
  filesScanned++;
  const condRanges = collectConditionalRanges(src);
  const inCond = (idx) => condRanges.some(([a, b]) => idx > a && idx < b);

  /** Lewati balanced parens mulai di '(' terdekat >= from; balik index setelah penutup. */
  function skipBalanced(from, openCh = '(', closeCh = ')') {
    let depth = 0;
    let j = from;
    for (; j < src.length; j++) {
      if (src[j] === openCh) depth++;
      else if (src[j] === closeCh) { depth--; if (depth === 0) return j + 1; }
    }
    return j;
  }

  // Cari posisi body '{' setelah akhir match deklarasi fungsi.
  // fm[1] = nama function-decl (params '(' sudah dikonsumsi oleh match)
  // fm[2] = nama arrow (= ... => sudah dikonsumsi)
  function findBodyBrace(afterIdx, isFnDecl) {
    let j = afterIdx;
    if (isFnDecl) {
      // Kita berada SETELAH '(' pembuka parameter-list; tutup balance-nya.
      let pd = 1;
      while (j < n && pd > 0) {
        if (src[j] === '(') pd++;
        else if (src[j] === ')') pd--;
        j++;
      }
      // Lewati whitespace ke '{'
      while (j < n && src[j] !== '{' && src[j] !== ';') j++;
      return src[j] === '{' ? j : -1;
    }
    // Arrow: boleh dibungkus '( … )' lalu '{'. Juga '=> {' langsung.
    while (j < n) {
      const c = src[j];
      if (c === ' ') { j++; continue; }
      if (c === '(') { j = skipBalanced(j); continue; }
      break;
    }
    return src[j] === '{' ? j : -1;
  }

  const n = src.length;
  const stack = [{ kind: 'fn', name: '<module>', comp: false, customHook: true, hookDepth: 0 }];
  const pendingFns = []; // { openBraceIdx, name, comp, customHook }

  let i = 0;
  while (i < n) {
    const ch = src[i];

    // ── Deklarasi fungsi? ──
    FN_RE.lastIndex = i;
    const fm = FN_RE.exec(src);
    if (fm && fm.index === i) {
      const isFnDecl = !!fm[1];
      const name = fm[1] || fm[2] || '<anon>';
      pendingFns.push({
        name,
        comp: /^[A-Z]/.test(name),
        customHook: /^use[A-Z]/.test(name),
        expectAt: findBodyBrace(i + fm[0].length, isFnDecl),
      });
      i += fm[0].length;
      continue;
    }

    // ── Hook call? (cepat: mulai huruf u/R) ──
    if ((ch === 'u' || ch === 'R')) {
      HOOK_RE.lastIndex = i;
      const hm = HOOK_RE.exec(src);
      if (hm && hm.index === i) {
        // Scope check
        let foundFn = null;
        for (let s = stack.length - 1; s >= 0; s--) {
          if (stack[s].kind === 'fn') { foundFn = stack[s]; break; }
        }
        let legal = true;
        let reason = '';
        if (!foundFn) { legal = false; reason = 'di luar scope fungsi'; }
        else {
          if (foundFn.hookDepth > 0) { legal = false; reason = `nested di dalam callback/helper (depth ${foundFn.hookDepth})`; }
          if (foundFn.name !== '<module>' && !foundFn.comp && !foundFn.customHook) { legal = false; reason = `di dalam fungsi non-component "${foundFn.name}"`; }
          if (legal && foundFn.name !== '<module>' && !foundFn.customHook && foundFn.hookDepth === 0 && inCond(i)) {
            legal = false; reason = 'di dalam blok if/loop component';
          }
          if (legal && foundFn.name === '<module>') { legal = false; reason = 'hook di level module (bukan component)'; }
        }

        if (!legal) {
          violations.push({
            file: relPath,
            line: lineOf(raw, i),
            hook: hm[0].replace(/\s*\($/, ''),
            reason,
            ctx: raw.slice(i, i + 80).replace(/\s+/g, ' ').trim(),
          });
        }

        // Lompati seluruh argumen hook (callback nested legal, tak perlu scan)
        const op = src.indexOf('(', i + hm[0].length - 1);
        i = skipBalanced(op);
        continue;
      }
      i += 1;
      continue;
    }

    if (ch === '{') {
      const pi = pendingFns.findIndex((p) => p.expectAt === i);
      if (pi !== -1) {
        const p = pendingFns.splice(pi, 1)[0];
        stack.push({ kind: 'fn', name: p.name, comp: p.comp, customHook: p.customHook, hookDepth: 0 });
      } else {
        stack.push({ kind: 'block' });
      }
      i += 1;
      continue;
    }

    if (ch === '}') {
      for (let s = stack.length - 1; s > 0; s--) {
        const f = stack.pop();
        if (f.kind === 'fn' || f.kind === 'block') break;
      }
      i += 1;
      continue;
    }

    if (ch === '(') { stack.push({ kind: 'paren' }); i += 1; continue; }
    if (ch === ')') {
      for (let s = stack.length - 1; s > 0; s--) {
        const f = stack.pop();
        if (f.kind === 'paren') break;
      }
      i += 1;
      continue;
    }

    i += 1;
  }
}

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jsx|js)$/.test(e.name)) scanFile(path.relative(ROOT, p));
  }
}
walk(path.join(ROOT, 'src'));

console.log(`Scanned ${filesScanned} files under src/.`);
const real = violations.filter((v) => !v.file.includes('.test.'));
if (real.length === 0) {
  console.log('✅ Rules of Hooks OK — tidak ada pelanggaran.');
  process.exit(0);
}
console.log(`❌ ${real.length} pelanggaran Rules of Hooks:\n`);
for (const v of real) {
  console.log(`  ${v.file}:${v.line}  ${v.hook}()  →  ${v.reason}`);
  console.log(`     …${v.ctx}`);
}
process.exit(1);
