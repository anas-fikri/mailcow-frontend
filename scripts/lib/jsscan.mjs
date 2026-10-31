/**
 * Bersihkan kode JS/JSX: ganti semua karakter NON-KODE (isi string, komentar,
 * teks mentah template literal) dengan SPASI — offset tetap terjaga.
 *
 * Penanganan template literal NESTED yang benar:
 *   - backtick pembuka/penutup       → spasi
 *   - teks mentah di dalam ``        → spasi
 *   - '${'                           → dua spasi (BUKAN brace nyata)
 *   - '}' penutup interpolasi        → satu spasi (BUKAN brace nyata)
 *   - KODE di dalam ${ ... }         → dipertahankan & discan normal
 *     (recurse), sehingga brace-nya tetap dihitung.
 *
 * Hasil: string hasil PANJANGNYA SAMA dengan input; setiap '{'/'}' yang
 * tersisa adalah struktur blok nyata → aman untuk brace-balancing.
 */

export function cleanJsSource(src) {
  const n = src.length;
  // Salin RAW sebagai baseline: newline (& karakter lain) bertahan otomatis;
  // mode-mode scanner hanya MENIMPA posisi yang perlu dijadikan spasi.
  const out = [...src];

  /**
   * Scan region code mulai index i sampai menemukan terminator pada stopSet
   * (misalnya '}' penutup interpolasi) atau akhir input.
   * @returns {number} index setelah terminator (atau n)
   */
  function scanCode(i, stopAtCloseBrace) {
    let mode = 'code';
    const tplStack = []; // untuk template literal bersarang
    while (i < n) {
      const ch = src[i];
      const nx = i + 1 < n ? src[i + 1] : '';

      if (mode === 'line') {
        if (ch === '\n') { mode = 'code'; }
        else { out[i] = ' '; }
        i++;
        continue;
      }
      if (mode === 'block') {
        if (ch === '*' && nx === '/') { out[i] = ' '; out[i + 1] = ' '; i += 2; mode = 'code'; continue; }
        if (ch !== '\n') out[i] = ' ';
        i++;
        continue;
      }

      if (mode === 'str') {
        // karakter pembuka q sudah diganti spasi sebelum masuk sini
        if (ch === '\\') { out[i] = ' '; if (i + 1 < n) out[i + 1] = ' '; i += 2; continue; }
        if (ch === '"' || ch === "'") { out[i] = ' '; i++; mode = 'code'; continue; }
        if (ch === '\n') { i++; mode = 'code'; continue; } // newline membatalkan unterminated
        out[i] = ' ';
        i++;
        continue;
      }

      // ── mode === 'code' ──
      if (ch === '/' && nx === '/') { mode = 'line'; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
      if (ch === '/' && nx === '*') { mode = 'block'; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }

      if (ch === '"' || ch === "'") {
        out[i] = ' ';
        i++;
        mode = 'str';
        continue;
      }

      if (ch === '`') {
        out[i] = ' ';
        i++;
        // Masuk region template: telan teks mentah; setiap '${' buka sub-kode
        while (i < n) {
          const c = src[i];
          const c2 = i + 1 < n ? src[i + 1] : '';
          if (c === '\\') {
            if (i + 1 < n) out[i + 1] = ' ';
            i += 2;
            continue;
          }
          if (c === '`') { out[i] = ' '; i++; break; } // tpl selesai
          if (c === '$' && c2 === '{') {
            out[i] = ' '; out[i + 1] = ' ';
            i += 2;
            // Recurse: kode di dalam interpolasi, berhenti saat '}'
            i = scanCode(i, true);
            continue;
          }
          if (c === '\n') { /* baris baru di tpl valid */ }
          else { out[i] = ' '; }
          i++;
        }
        continue;
      }

      // Karakter biasa: pertahankan apa adanya
      out[i] = ch;

      // Jika kita sedang di dalam interpolasi dan ini '}', stop disini —
      // pemanggil (region tpl) akan menandainya spasi dan lanjut tpl.
      if (stopAtCloseBrace && ch === '}' && tplStack.length === 0) {
        return i + 1;
      }

      i++;
    }
    return i;
  }

  scanCode(0, false);
  return out.join('');
}
