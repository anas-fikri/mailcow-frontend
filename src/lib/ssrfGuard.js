/**
 * SSRF guard — klasifikasi IP privat/reserved (pure, tanpa dependency Node).
 * Dipakai oleh server.js (remote image proxy) untuk memblokir fetch ke
 * jaringan internal (metadata cloud, DB, loopback, dll) saat me-render gambar
 * email. Pure string/number — bisa diuji di Node dan tidak dibundle ke frontend.
 *
 * Prinsip: fail-closed — IP yang tidak bisa diparse dianggap terblokir.
 */

function ipv4Parts(ip) {
  const parts = String(ip).trim().split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return nums;
}

/** True bila IPv4 masuk rentang privat/loopback/link-local/reserved/multicast. */
export function isBlockedIpv4(ip) {
  const parts = ipv4Parts(ip);
  if (!parts) return true; // invalid → block (fail closed)
  const [a, b, c] = parts;
  if (a === 0) return true;                          // 0.0.0.0/8 (this network)
  if (a === 10) return true;                         // 10.0.0.0/8 (private)
  if (a === 127) return true;                        // 127.0.0.0/8 (loopback)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 169 && b === 254) return true;           // 169.254.0.0/16 (link-local)
  if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12 (private)
  if (a === 192 && b === 0 && c === 0) return true;  // 192.0.0.0/24
  if (a === 192 && b === 0 && c === 2) return true;  // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 168) return true;           // 192.168.0.0/16 (private)
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 (benchmark)
  if (a === 198 && b === 51 && c === 100) return true;  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 203 && b === 0 && c === 113) return true;   // 203.0.113.0/24 (TEST-NET-3)
  if (a >= 224) return true;                         // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + broadcast
  return false;
}

/** True bila IPv6 masuk rentang loopback/unspecified/link-local/ULA/multicast/dokumentasi. */
export function isBlockedIpv6(ip) {
  const bare = String(ip).trim().split('%')[0].toLowerCase();
  if (!bare || !bare.includes(':')) return true; // invalid → block (fail closed)

  // IPv4-mapped ::ffff:a.b.c.d → klasifikasikan sebagai IPv4
  const mapped = bare.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);

  // Hanya hex + titik dua (fail-closed: karakter asing → blokir).
  if (!/^[0-9a-f:.]+$/.test(bare)) return true;

  if (bare === '::' || bare === '::1') return true;    // unspecified / loopback
  if (/^fe[89ab]/i.test(bare)) return true;            // fe80::/10 (link-local)
  if (/^f[cd]/i.test(bare)) return true;               // fc00::/7 (unique-local)
  if (/^ff/i.test(bare)) return true;                  // ff00::/8 (multicast)
  if (/^2001:db8:/i.test(bare)) return true;           // 2001:db8::/32 (documentation)
  return false;
}

/** True bila IP (v4 atau v6) terblokir. Kosong/invalid → true (fail closed). */
export function isBlockedIp(ip) {
  const s = String(ip ?? '').trim();
  if (!s) return true;
  return s.includes(':') ? isBlockedIpv6(s) : isBlockedIpv4(s);
}
