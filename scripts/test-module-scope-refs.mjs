/**
 * STATIC GUARD — bug class "helper module-scope memakai state komponen".
 *
 * Latar belakang (outage 2026-09-05): `flagColorOf`/`setFlagColorOf`
 * dideklarasikan di MODULE SCOPE MailPage.jsx dengan body/default-param yang
 * mereferensikan `user` & `selectedFolder` (state komponen). Di module scope
 * identifier itu tidak terdefinisi → ReferenceError saat chunk MailPage
 * dirender → error boundary di SEMUA halaman /webmail/mail untuk SEMUA user.
 * Verifikasi deploy md5/string marker tidak menangkapnya; E2E browser yang
 * menemukan. Guard ini mencegah kelas bug itu masuk lagi lewat suite.
 *
 * Yang dicek (AST scope-aware, acorn + acorn-jsx):
 *  1. no-undef: identifier yang tidak terdeklarasi di scope manapun dalam
 *     file (dan bukan global browser/JS) — persis kelas bug outage.
 *  2. TDZ same-scope: pemakaian let/const/class SEBELUM deklarasinya pada
 *     scope yang sama, saat referensi dieksekusi langsung (bukan di dalam
 *     fungsi yang dipanggil belakangan) — kelas crash CalendarPage
 *     "Cannot access 'X' before initialization".
 *
 * Jalankan: node scripts/test-module-scope-refs.mjs  (bagian suite test-*.mjs)
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Parser as AcornParser } from 'acorn';
import acornJsx from 'acorn-jsx';

const Parser = AcornParser.extend(acornJsx());

// ─── Globals allowlist (browser + JS builtins + build env) ───────────────────
const GLOBALS = new Set([
  // JS builtins
  'Array', 'Object', 'String', 'Number', 'Boolean', 'Symbol', 'BigInt', 'Math', 'JSON',
  'Date', 'RegExp', 'Error', 'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError',
  'TypeError', 'URIError', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Intl',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
  'encodeURI', 'decodeURI', 'structuredClone', 'queueMicrotask', 'undefined', 'NaN', 'Infinity',
  'Uint8Array', 'Uint8ClampedArray', 'Int8Array', 'Uint16Array', 'Int16Array', 'Uint32Array',
  'Int32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array',
  'ArrayBuffer', 'SharedArrayBuffer', 'DataView', 'TextEncoder', 'TextDecoder',
  'Proxy', 'Reflect', 'Function', 'eval', 'escape', 'unescape',
  // Browser
  'window', 'self', 'globalThis', 'document', 'location', 'navigator', 'history', 'screen',
  'localStorage', 'sessionStorage', 'console', 'fetch', 'XMLHttpRequest', 'WebSocket',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'requestAnimationFrame',
  'cancelAnimationFrame', 'requestIdleCallback', 'alert', 'confirm', 'prompt', 'atob', 'btoa',
  'getComputedStyle', 'matchMedia', 'addEventListener', 'removeEventListener', 'dispatchEvent',
  'scrollTo', 'scrollBy', 'open', 'close', 'focus', 'blur', 'print', 'postMessage',
  'innerWidth', 'innerHeight', 'outerWidth', 'outerHeight', 'devicePixelRatio', 'scrollX', 'scrollY',
  'URL', 'URLSearchParams', 'Blob', 'File', 'FileReader', 'FormData', 'Headers', 'Request',
  'Response', 'AbortController', 'AbortSignal', 'ReadableStream', 'WritableStream',
  'CustomEvent', 'Event', 'EventSource', 'ErrorEvent', 'MessageEvent', 'CloseEvent',
  'MouseEvent', 'KeyboardEvent', 'InputEvent', 'DragEvent', 'FocusEvent', 'ClipboardEvent',
  'Notification', 'MutationObserver', 'IntersectionObserver', 'ResizeObserver',
  'PerformanceObserver', 'performance', 'crypto', 'caches', 'Worker', 'SharedWorker',
  'BroadcastChannel', 'MessageChannel', 'Image', 'Audio',
  'DOMParser', 'XMLSerializer', 'Node', 'Element', 'HTMLElement', 'CSS', 'customElements',
  'visibilityState', 'DOMException', 'reportError',
  // Build/env (dipakai lib, bukan state komponen)
  'process', 'Buffer',
]);

// ─── Scope tree (pass A) ──────────────────────────────────────────────────────
class Binding {
  constructor(name, scope, kind, start) {
    this.name = name; this.scope = scope; this.kind = kind; this.start = start;
  }
}
class Scope {
  constructor(type, parent) {
    this.type = type; this.parent = parent; this.bindings = new Map();
    this.children = []; this.directRefs = [];
    if (parent) parent.children.push(this);
  }
  declare(name, kind, start) {
    if (!name) return;
    if (!this.bindings.has(name)) this.bindings.set(name, new Binding(name, this, kind, start));
  }
  resolve(name) {
    let s = this;
    while (s) {
      const b = s.bindings.get(name);
      if (b) return b;
      s = s.parent;
    }
    return null;
  }
  /** Scope fungsi terdekat (module scope dihitung fungsi-level utk eksekusi langsung). */
  nearestFunction() {
    let s = this;
    while (s && s.type === 'block') s = s.parent;
    return s;
  }
}

function declarePattern(node, scope, kind) {
  if (!node) return;
  switch (node.type) {
    case 'Identifier': scope.declare(node.name, kind, node.start); break;
    case 'ObjectPattern':
      for (const p of node.properties || []) {
        if (p.type === 'RestElement') declarePattern(p.argument, scope, kind);
        else declarePattern(p.value, scope, kind);
      }
      break;
    case 'ArrayPattern':
      for (const el of node.elements || []) declarePattern(el, scope, kind);
      break;
    case 'AssignmentPattern':
      declarePattern(node.left, scope, kind); break;
    case 'RestElement':
      declarePattern(node.argument, scope, kind); break;
    default: break;
  }
}

function isScopeNode(node) {
  return node.type === 'Program'
    || node.type === 'BlockStatement' || node.type === 'StaticBlock'
    || node.type === 'ForStatement' || node.type === 'ForInStatement' || node.type === 'ForOfStatement'
    || node.type === 'SwitchStatement'
    || node.type === 'CatchClause'
    || node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression'
    || node.type === 'ArrowFunctionExpression';
}

function scopeTypeOf(node) {
  if (node.type === 'Program') return 'module';
  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') return 'function';
  return 'block';
}

/** Pass A: bangun scope tree + deklarasi semua binding (posisi presisi utk TDZ). */
function buildScopes(node, parentScope, nodeScopes) {
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') return;

  if (isScopeNode(node)) {
    const scope = new Scope(scopeTypeOf(node), parentScope);
    nodeScopes.set(node, scope);

    if (node.type === 'Program') {
      for (const st of node.body) {
        if (st.type === 'ImportDeclaration') {
          for (const sp of st.specifiers) scope.declare(sp.local.name, 'import', sp.start);
        }
      }
    }
    if (node.type === 'FunctionDeclaration' && node.id && parentScope) {
      parentScope.declare(node.id.name, 'function', node.start);
    }
    if (node.type === 'FunctionExpression' && node.id) {
      scope.declare(node.id.name, 'function', node.start);
    }
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
      for (const p of node.params || []) declarePattern(p, scope, 'param');
    }
    if (node.type === 'CatchClause' && node.param) declarePattern(node.param, scope, 'param');

    const scanDecls = (statements) => {
      for (const st of statements || []) {
        if (st.type === 'VariableDeclaration') {
          for (const d of st.declarations) declarePattern(d.id, scope, st.kind);
        }
        if (st.type === 'FunctionDeclaration' && st.id) scope.declare(st.id.name, 'function', st.start);
        if (st.type === 'ClassDeclaration' && st.id) scope.declare(st.id.name, 'class', st.start);
      }
    };
    if (node.type === 'Program' || node.type === 'BlockStatement' || node.type === 'StaticBlock') scanDecls(node.body);
    if (node.type === 'SwitchStatement') for (const c of node.cases) scanDecls(c.consequent);
    if (node.type.startsWith('For')) {
      const decl = node.init || node.left;
      if (decl && decl.type === 'VariableDeclaration') {
        for (const d of decl.declarations) declarePattern(d.id, scope, decl.kind);
      }
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue;
      if (Array.isArray(value)) value.forEach((v) => buildScopes(v, scope, nodeScopes));
      else if (value && typeof value === 'object' && typeof value.type === 'string') buildScopes(value, scope, nodeScopes);
    }
    return;
  }

  if (node.type === 'ClassDeclaration' && node.id && parentScope) {
    parentScope.declare(node.id.name, 'class', node.start);
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue;
    if (Array.isArray(value)) value.forEach((v) => buildScopes(v, parentScope, nodeScopes));
    else if (value && typeof value === 'object' && typeof value.type === 'string') buildScopes(value, parentScope, nodeScopes);
  }
}

// ─── Pass B: resolve referensi + TDZ ──────────────────────────────────────────
let CURRENT_FILE = '(unknown)';
const issues = [];

function recordRef(scope, node) {
  const fScope = scope.nearestFunction();
  fScope.directRefs.push({ name: node.name, start: node.start, line: node.loc?.start.line, col: node.loc?.start.column });
}

function reportNoUndef(node) {
  issues.push({
    file: CURRENT_FILE, line: node.loc?.start.line, col: node.loc?.start.column,
    kind: 'no-undef', name: node.name,
  });
}

function isNonRefPosition(parent, pkey) {
  if (!parent) return false;
  if (parent.type === 'MemberExpression' && pkey === 'property' && !parent.computed) return true;
  if (parent.type === 'Property' && pkey === 'key' && !parent.computed && !parent.shorthand) return true;
  if ((parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') && pkey === 'key' && !parent.computed) return true;
  if ((parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') && pkey === 'label') return true;
  if (parent.type === 'MetaProperty') return true;
  if (parent.type === 'JSXAttribute' && pkey === 'name') return true;
  if (parent.type === 'JSXMemberExpression' && pkey === 'property') return true;
  return false;
}

function visit(node, parent, pkey, scope, nodeScopes, fnScope) {
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') return;

  if (isScopeNode(node)) {
    const s = nodeScopes.get(node) || scope;
    const effectiveFn = s.type === 'function' ? s : (s.type === 'module' ? s : fnScope);
    visitChildren(node, parent, pkey, s, nodeScopes, effectiveFn);
    checkTdz(s);
    return;
  }

  if (node.type === 'Identifier') {
    if (isNonRefPosition(parent, pkey)) return;
    const binding = scope ? scope.resolve(node.name) : null;
    if (!binding && !GLOBALS.has(node.name)) reportNoUndef(node);
    else if (binding) recordRef(scope, node);
    return;
  }

  // JSX
  if (node.type === 'JSXIdentifier') {
    const isTagRef =
      (parent?.type === 'JSXOpeningElement' && pkey === 'name' && /^[A-Z$]/.test(node.name)) ||
      (parent?.type === 'JSXMemberExpression' && pkey === 'object');
    if (isTagRef) {
      const binding = scope ? scope.resolve(node.name) : null;
      if (!binding && !GLOBALS.has(node.name)) reportNoUndef(node);
    }
    return;
  }
  if (node.type === 'JSXOpeningElement') {
    visit(node.name, node, 'name', scope, nodeScopes, fnScope);
    for (const a of node.attributes || []) visit(a, node, 'attributes', scope, nodeScopes, fnScope);
    return;
  }
  if (node.type === 'JSXAttribute') {
    if (node.value) visit(node.value, node, 'value', scope, nodeScopes, fnScope);
    return;
  }
  if (node.type === 'JSXMemberExpression') {
    visit(node.object, node, 'object', scope, nodeScopes, fnScope);
    return;
  }
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
    const kids = node.type === 'JSXElement'
      ? [node.openingElement, ...(node.children || []), node.closingElement]
      : [node.openingFragment, ...(node.children || []), node.closingFragment];
    for (const k of kids) if (k) visit(k, node, 'jsx', scope, nodeScopes, fnScope);
    return;
  }
  if (node.type === 'JSXExpressionContainer' || node.type === 'JSXSpreadChild') {
    if (node.expression && node.expression.type !== 'JSXEmptyExpression') {
      visit(node.expression, node, 'expression', scope, nodeScopes, fnScope);
    }
    return;
  }
  if (node.type === 'JSXSpreadAttribute') {
    visit(node.argument, node, 'argument', scope, nodeScopes, fnScope);
    return;
  }

  // Posisi khusus
  if (node.type === 'VariableDeclarator') {
    if (node.init) visit(node.init, node, 'init', scope, nodeScopes, fnScope);
    return;
  }
  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
    for (const p of node.params || []) visitParamDefaults(p, scope, nodeScopes, fnScope);
    if (node.body) visit(node.body, node, 'body', scope, nodeScopes, fnScope);
    return;
  }
  if (node.type === 'CatchClause') {
    if (node.body) visit(node.body, node, 'body', scope, nodeScopes, fnScope);
    return;
  }
  if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
    visit(node.object, node, 'object', scope, nodeScopes, fnScope);
    if (node.computed) visit(node.property, node, 'property', scope, nodeScopes, fnScope);
    return;
  }
  if (node.type === 'Property' || node.type === 'PropertyDefinition' || node.type === 'MethodDefinition') {
    if (node.computed && node.key) visit(node.key, node, 'key', scope, nodeScopes, fnScope);
    if (node.value) visit(node.value, node, 'value', scope, nodeScopes, fnScope);
    return;
  }
  if (node.type === 'ImportDeclaration' || node.type === 'ImportSpecifier' || node.type === 'ImportDefaultSpecifier'
    || node.type === 'ImportNamespaceSpecifier' || node.type === 'ExportSpecifier' || node.type === 'MetaProperty'
    || node.type === 'TemplateElement' || node.type === 'PrivateIdentifier'
    || node.type === 'LabeledStatement' || node.type === 'BreakStatement' || node.type === 'ContinueStatement') {
    return;
  }

  visitChildren(node, parent, pkey, scope, nodeScopes, fnScope);
}

function visitParamDefaults(p, scope, nodeScopes, fnScope) {
  if (!p) return;
  if (p.type === 'AssignmentPattern') visit(p.right, p, 'right', scope, nodeScopes, fnScope);
  else walkPatternDefaults(p, scope, nodeScopes, fnScope);
}
function walkPatternDefaults(p, scope, nodeScopes, fnScope) {
  if (!p || typeof p !== 'object' || typeof p.type !== 'string') return;
  if (p.type === 'AssignmentPattern') {
    visit(p.right, p, 'right', scope, nodeScopes, fnScope);
    walkPatternDefaults(p.left, scope, nodeScopes, fnScope);
    return;
  }
  for (const [key, value] of Object.entries(p)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue;
    if (Array.isArray(value)) value.forEach((v) => walkPatternDefaults(v, scope, nodeScopes, fnScope));
    else if (value && typeof value === 'object' && typeof value.type === 'string') walkPatternDefaults(value, scope, nodeScopes, fnScope);
  }
}

function visitChildren(node, parent, pkey, scope, nodeScopes, fnScope) {
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'type' || key === 'regex' || key === 'raw') continue;
    if (Array.isArray(value)) value.forEach((v) => visit(v, node, key, scope, nodeScopes, fnScope));
    else if (value && typeof value === 'object' && typeof value.type === 'string') visit(value, node, key, scope, nodeScopes, fnScope);
  }
}

/** TDZ: pemakaian langsung (bukan di dalam fungsi nested) sebelum deklarasi let/const/class di scope sama. */
function checkTdz(scope) {
  for (const ref of scope.directRefs) {
    const b = scope.bindings.get(ref.name);
    if (b && (b.kind === 'let' || b.kind === 'const' || b.kind === 'class') && b.start > ref.start) {
      issues.push({
        file: CURRENT_FILE, line: ref.line, col: ref.col, kind: 'tdz', name: ref.name,
        detail: `dipakai (line ${ref.line}) sebelum deklarasi di scope yang sama`,
      });
    }
  }
}

// ─── Analyze satu file (dipakai driver & self-test) ──────────────────────────
function analyzeCode(code, fileName) {
  const savedFile = CURRENT_FILE;
  const savedIssues = issues.splice(0, issues.length); // kosongkan + simpan
  CURRENT_FILE = fileName;
  try {
    const ast = Parser.parse(code, {
      ecmaVersion: 'latest', sourceType: 'module', locations: true, allowAwaitOutsideFunction: true,
    });
    const nodeScopes = new Map();
    buildScopes(ast, null, nodeScopes);
    visit(ast, null, null, nodeScopes.get(ast), nodeScopes, nodeScopes.get(ast));
    return issues.splice(0, issues.length);
  } catch (err) {
    return [{ file: fileName, line: err.loc?.line, col: err.loc?.column, kind: 'parse', name: err.message }];
  } finally {
    CURRENT_FILE = savedFile;
    issues.push(...savedIssues);
  }
}

// ─── Self-test: guard HARUS bisa menangkap kelas bug yang diceknya ────────────
function selfTest() {
  const badModuleRef = [
    "import { useState } from 'react';",
    '// komentar menyebut user & selectedFolder — komentar TIDAK boleh dihitung',
    'const helperOf = (uid, folder = selectedFolder) => user?.email && uid;',
    'export default function Page() {',
    "  const [selectedFolder] = useState('x');",
    '  const user = { email: \'a@b.c\' };',
    '  return <div onClick={() => helperOf(1)}>{selectedFolder}</div>;',
    '}',
  ].join('\n');
  const badTdz = [
    "import { useState } from 'react';",
    'const A = B + 1;',
    'const B = 2;',
    'export default function Page() { return <div>{A}</div>; }',
  ].join('\n');
  const goodSnippet = [
    "import { useState } from 'react';",
    'const pure = (n) => n * 2;',
    'export default function Page() {',
    "  const [v] = useState(0);",
    '  const bound = (x, folder = v) => pure(x) + folder;',
    '  return <div onClick={() => bound(1, 2)}>{v}</div>;',
    '}',
  ].join('\n');

  const results = [];
  const r1 = analyzeCode(badModuleRef, 'selftest-module-ref.jsx');
  results.push({ name: 'module-scope state ref terdeteksi', ok: r1.some((i) => i.kind === 'no-undef' && i.name === 'selectedFolder') && r1.some((i) => i.kind === 'no-undef' && i.name === 'user') });
  const r2 = analyzeCode(badTdz, 'selftest-tdz.jsx');
  results.push({ name: 'TDZ use-before-declare terdeteksi', ok: r2.some((i) => i.kind === 'tdz' && i.name === 'B') });
  const r3 = analyzeCode(goodSnippet, 'selftest-good.jsx');
  results.push({ name: 'kode sehat tidak false-positive', ok: r3.length === 0 });

  const failedSelf = results.filter((r) => !r.ok);
  if (failedSelf.length > 0) {
    console.error('❌ SELF-TEST guard gagal — analyzer tidak bisa dipercaya:');
    for (const f of failedSelf) console.error(`  - ${f.name}`);
    console.error('  detail:', JSON.stringify([r1, r2, r3], null, 1));
    return 1;
  }
  console.log('✅ self-test guard: 3/3 (deteksi module-ref, deteksi TDZ, tanpa false-positive)');
  return 0;
}

// ─── Driver ───────────────────────────────────────────────────────────────────
const ROOT = process.cwd();
const targets = [];
function addDir(dir) {
  const full = join(ROOT, dir);
  if (!existsSync(full)) return;
  for (const f of readdirSync(full, { withFileTypes: true })) {
    if (f.isDirectory()) continue;
    if (/\.(jsx|js)$/.test(f.name)) targets.push(join(dir, f.name));
  }
}
addDir('src/pages');
addDir('src/components/mailer');
targets.push('src/App.jsx', 'src/main.jsx');

// Mode self-test: validasi analyzer, tidak memeriksa file produksi.
if (process.argv.includes('--self-test')) {
  process.exitCode = selfTest();
} else {
  const selfOk = selfTest() === 0;
  let failed = selfOk ? 0 : 1;
  for (const rel of targets) {
    const full = join(ROOT, rel);
    if (!existsSync(full)) continue;
    issues.push(...analyzeCode(readFileSync(full, 'utf8'), rel));
  }
  if (failed === 0 && issues.length === 0) {
    console.log(`✅ module-scope refs guard: ${targets.length} file diperiksa, tanpa temuan`);
  } else {
    failed = 1;
    console.error(`❌ module-scope refs guard: ${issues.length} temuan:`);
    for (const i of issues) {
      if (i.kind === 'no-undef') {
        console.error(`  [no-undef] ${i.file}:${i.line}:${i.col} — '${i.name}' tidak terdeklarasi di file (kelas bug outage 2026-09-05)`);
      } else if (i.kind === 'tdz') {
        console.error(`  [tdz] ${i.file}:${i.line}:${i.col} — '${i.name}' ${i.detail}`);
      } else {
        console.error(`  [parse] ${i.file}:${i.line} — ${i.name}`);
      }
    }
    console.error('\nAturan: helper module-scope TIDAK BOLEH mereferensikan state komponen — pindahkan ke dalam komponen (docs/ai/knowledge.md 2026-09-05).');
  }
  process.exitCode = failed;
}
