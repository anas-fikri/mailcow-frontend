// ─── Local Phishing Detection (regex + blacklist, tanpa AI) ──────────────────
// Analisis header, URL, dan konten email untuk mendeteksi phishing/scam.
// Semua berjalan di browser — tidak ada data yang dikirim ke server/PII.

// ── 1. Domain blacklist (known phishing / high-risk) ────────────────────────
// Domain populer yang sering di-spoof atau digunakan untuk phishing.
const SPOOFED_BRANDS = [
  'paypa1.com', 'paypol.com', 'g00gle.com', 'gooogle.com',
  'micr0soft.com', 'appl.com', 'arnazon.com', 'amaz0n.com',
  'netf1ix.com', 'faceb00k.com', 'linkedln.com',
  '0utlook.com', 'hotmaill.com', 'yaho0.com',
  'apple-id-verify.com', 'apple-support.com', 'itunes-verify.com',
  'secure-bankofamerica.com', 'chase-secure.com',
  'dhl-express.com', 'fedex-tracking.com', 'uspssupport.com',
  'coinbaise.com', 'blockchaine-verify.com',
  'whatsapp-web.com', 'telegram-update.com',
  'gov-id-verify.com', 'tax-refund-gov.com',
];

// ── 2. URL shorteners (sering dipakai untuk menyembunyikan URL phishing) ────
const URL_SHORTENERS = [
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd',
  'buff.ly', 'cutt.ly', 'shorturl.at', 'rb.gy', 'bl.ink',
  'lnkd.in', 'youtu.be', 'amzn.to', 'a.co',
];

// ── 3. Urgency / scam keywords (Bahasa Indonesia + Inggris) ────────────────
const URGENCY_KEYWORDS = [
  // Indonesia
  /segera\s+verifikasi/i, /akun\s+anda\s+(akan|telah)\s+(diblokir|dihapus)/i,
  /klik\s+segera/i, /batas\s+waktu\s+(habis|sudah)/i,
  /tindakan\s+(segera|diwajibkan)/i, /konfirmasi\s+(sekarang|identitas)/i,
  /akun\s+terkunci/i, /password\s+(akan|telah)\s+(kedaluwarsa|berubah)/i,
  /uang\s+(anda|akan)\s+(hangus|hilang)/i, /transfer\s+(segera|darurat)/i,
  // English
  /act\s+now/i, /urgent\s+action\s+required/i,
  /your\s+account\s+(will\s+be|has\s+been)\s+(suspended|locked|closed)/i,
  /verify\s+your\s+account\s+immediately/i,
  /click\s+here\s+now/i, /deadline\s+(has\s+passed|expir)/i,
  /confirm\s+your\s+identity/i, /password\s+(expir|will\s+expire)/i,
  /your\s+ funds\s+will\s+(be\s+)?(lost|frozen)/i,
  /wire\s+transfer\s+(immediately|urgent)/i,
];

const PRIZE_SCAM_KEYWORDS = [
  /selamat\s+(anda\s+)?(menang|terpilih)/i, /hadiah\s+( Rp|Rp\.|USD|\$)/i,
  /claim\s+your\s+prize/i, /you\s+have\s+been\s+selected/i,
  /congratulations\s+you\s+won/i, /lottery\s+winner/i,
  /million\s+(dollars|euros|rupiah)/i, /inheritance\s+fund/i,
  /nigerian?\s+prince/i, /beneficiary\s+of\s+a\s+late/i,
  /urgent\s+business\s+proposal/i, /mutual\s+benefit/i,
];

const CREDENTIAL_HARVEST_KEYWORDS = [
  /masukkan\s+(password|kata\s+sandi|pin|otp|kode\s+verifikasi)/i,
  /enter\s+your\s+(password|pin|otp|verification\s+code)/i,
  /kirim\s+kami\s+password/i, /send\s+us\s+your\s+password/i,
  /update\s+payment\s+method/i, /perbarui\s+metode\s+pembayaran/i,
  /verify\s+payment/i, /konfirmasi\s+pembayaran/i,
];

const CEO_FRAUD_KEYWORDS = [
  /transfer\s+segera/i, /jangan\s+beritahu\s+siapapun/i,
  /rahasia\s+perusahaan/i, /confidential\s+transaction/i,
  /do\s+not\s+discuss\s+with\s+anyone/i,
  /wire\s+transfer\s+request/i, /urgent\s+payment/i,
  /change\s+of\s+bank\s+details/i, /rekening\s+baru\s+saya/i,
];

// ── 4. Suspicious TLD patterns ─────────────────────────────────────────────
const SUSPICIOUS_TLDS = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top', '.buzz', '.club'];

// ── 5. Header analysis patterns ─────────────────────────────────────────────
// Pola header yang menunjukkan spoofing / relay mencurigakan
const SUSPICIOUS_HEADER_PATTERNS = [
  /X-Mailer:\s*(?!Outlook|Thunderbird|Apple Mail|Mozilla|SOGo|Microsoft Outlook)/i,
  /Received:\s*from\s+\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/i, // IP langsung bukan hostname
];

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYSIS FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Ekstrak semua URL dari teks (plain + HTML).
 * @param {string} html - konten email (HTML atau plain text)
 * @returns {string[]} array URL yang ditemukan
 */
function extractUrls(html) {
  if (!html) return [];
  const urls = [];
  // URL di href attributes
  const hrefRe = /href\s*=\s*["']?\s*(https?:\/\/[^"'\s>]+)/gi;
  let m;
  while ((m = hrefRe.exec(html))) urls.push(m[1]);
  // URL naked di teks
  const nakedRe = /(?<!["'=])(https?:\/\/[^\s<>"')\]]+)/gi;
  while ((m = nakedRe.exec(html))) urls.push(m[1]);
  return [...new Set(urls)];
}

/**
 * Analisis URL: cek domain mencurigakan, IP address, shortener, typosquatting.
 * @returns {{ score: number, findings: string[] }}
 */
function analyzeUrls(urls) {
  let score = 0;
  const findings = [];
  // BUG 2026-10-29: tiap LINK dinilai ulang → newsletter dgn 13 link pelacak ke
  // host yang sama (mis. c.in.webengage.com) mendapat skor +130 & 13 temuan
  // kembar → "risiko tinggi" palsu. Kini setiap aturan dinilai SEKALI per host.
  const seenHosts = new Set();
  const deepSubdomains = [];

  for (const raw of urls) {
    try {
      const u = new URL(raw);
      const host = u.hostname.toLowerCase();
      // '@' di URL & port dinilai per URL unik (bukan per host) di bawah;
      // aturan berbasis host dilewati bila host sudah dinilai.
      const hostSeen = seenHosts.has(host);
      seenHosts.add(host);
      if (hostSeen) {
        if (raw.includes('@') && !findings.some((f) => f.startsWith('URL mengandung @'))) {
          score += 40;
          findings.push(`URL mengandung @ (technique phishing): ${String(raw || '').substring(0, 60)}`);
        }
        continue;
      }

      // IP address langsung (bukan domain)
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
        score += 30;
        findings.push(`URL pakai alamat IP langsung: ${host}`);
      }

      // Cek blacklist
      for (const bad of SPOOFED_BRANDS) {
        if (host === bad || host.endsWith('.' + bad)) {
          score += 50;
          findings.push(`Domain mencurigakan: ${host} (mirip brand terkenal)`);
          break;
        }
      }

      // URL shortener
      for (const short of URL_SHORTENERS) {
        if (host === short || host.endsWith('.' + short)) {
          score += 15;
          findings.push(`URL pakai pemendek link: ${host}`);
          break;
        }
      }

      // Suspicious TLD
      for (const tld of SUSPICIOUS_TLDS) {
        if (host.endsWith(tld)) {
          score += 10;
          findings.push(`TLD mencurigakan: ${tld} pada ${host}`);
          break;
        }
      }

      // @ in URL (common phishing trick) — sekali per pesan
      if (raw.includes('@') && !findings.some((f) => f.startsWith('URL mengandung @'))) {
        score += 40;
        findings.push(`URL mengandung @ (technique phishing): ${String(raw || '').substring(0, 60)}`);
      }

      // Punycode / IDN homograph (mengandung xn--)
      if (host.includes('xn--')) {
        score += 25;
        findings.push(`Domain pakai IDN/punycode: ${host} (potensi homograph attack)`);
      }

      // Subdomain berlebihan (bukan hanya www) — sinyal LEMAH: domain pelacak
      // newsletter sah sering bertingkat (click.mail.x.com). Dikumpulkan lalu
      // dinilai sekali di akhir (maks +10) sebagai satu temuan.
      const parts = host.split('.');
      if (parts.length > 3) deepSubdomains.push(host);

      // Port non-standar
      if (u.port && !['80', '443', ''].includes(u.port)) {
        score += 10;
        findings.push(`URL pakai port non-standar: ${u.port}`);
      }
    } catch { /* invalid URL — skip */ }
  }

  if (deepSubdomains.length) {
    score += Math.min(10, 5 * deepSubdomains.length);
    const shown = deepSubdomains.slice(0, 2).join(', ');
    const more = deepSubdomains.length > 2 ? ` (+${deepSubdomains.length - 2} lainnya)` : '';
    findings.push(`Subdomain berlebihan: ${shown}${more}`);
  }

  return { score, findings };
}

/**
 * Analisis From + Reply-To header — mismatch = indikasi kuat phishing.
 * @returns {{ score: number, findings: string[] }}
 */
function analyzeHeaders(from, replyTo) {
  let score = 0;
  const findings = [];

  if (from && replyTo) {
    const fromDomain = (from.match(/@([a-zA-Z0-9.-]+)/) || [])[1] || '';
    const replyDomain = (replyTo.match(/@([a-zA-Z0-9.-]+)/) || [])[1] || '';

    if (fromDomain && replyDomain && fromDomain.toLowerCase() !== replyDomain.toLowerCase()) {
      score += 35;
      findings.push(`From/Reply-To domain berbeda: "${fromDomain}" vs "${replyDomain}"`);
    }
  }

  // Cek display name spoofing — "Bank BCA <phishing@scam.xyz>"
  if (from) {
    const displayName = from.split('<')[0].trim();
    const emailPart = (from.match(/<([^>]+)>/) || [])[1] || from;
    const emailDomain = (emailPart.match(/@([a-zA-Z0-9.-]+)/) || [])[1] || '';

    // Cek apakah display name mengandung brand terkenal tapi domain berbeda
    const brandDomains = {
      'google': 'google.com', 'gmail': 'gmail.com',
      'microsoft': 'microsoft.com', 'outlook': 'outlook.com',
      'apple': 'apple.com', 'amazon': 'amazon.com',
      'paypal': 'paypal.com', 'facebook': 'facebook.com',
      'whatsapp': 'whatsapp.com', 'bank': null, // bank bisa banyak
    };
    for (const [brand, expectedDomain] of Object.entries(brandDomains)) {
      if (expectedDomain && displayName.toLowerCase().includes(brand) && emailDomain && emailDomain !== expectedDomain) {
        score += 40;
        findings.push(`Display name pakai brand "${brand}" tapi domain "${emailDomain}"`);
        break;
      }
    }
  }

  return { score, findings };
}

/**
 * Analisis konten email — keyword scam, urgency, credential harvesting.
 * @returns {{ score: number, findings: string[] }}
 */
function analyzeContent(text) {
  let score = 0;
  const findings = [];

  const checkPatterns = (patterns, label) => {
    for (const re of patterns) {
      if (re.test(text)) {
        score += label === 'urgency' ? 15 : 20;
        findings.push(`Terdeteksi pola ${label}: ${String(re?.source || '').substring(0, 40)}`);
        break; // satu per kategori cukup
      }
    }
  };

  checkPatterns(URGENCY_KEYWORDS, 'urgency');
  checkPatterns(PRIZE_SCAM_KEYWORDS, 'scam hadiah');
  checkPatterns(CREDENTIAL_HARVEST_KEYWORDS, 'credential harvesting');
  checkPatterns(CEO_FRAUD_KEYWORDS, 'CEO fraud');

  // Jumlah link berlebihan (>5 link body pendek = mencurigakan)
  const linkCount = (text.match(/<a\s/gi) || []).length;
  if (linkCount > 5 && text.length < 2000) {
    score += 10;
    findings.push(`Banyak link (${linkCount}) di body pendek (${text.length} chars)`);
  }

  // Base64 image besar (bisa jadi tracking pixel atau payload)
  const base64Images = (text.match(/src\s*=\s*["']?data:image\/[^"'\s]{0,10};base64,/gi) || []).length;
  if (base64Images > 3) {
    score += 10;
    findings.push(`${base64Images} gambar base64 inline (potensi tracking/payload)`);
  }

  return { score, findings };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Risk levels:
 *   0-19  → 'safe'     (tidak ada indikasi)
 *   20-49 → 'low'      (indikasi lemah, perlu waspada)
 *   50-79 → 'medium'   (cukup kuat, tampilkan warning)
 *   80+   → 'high'     (sangat mencurigakan, warning besar)
 */
export const RISK_LEVELS = {
  safe:   { label: 'Aman',              color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  low:    { label: 'Waspada',           color: 'text-amber-600 dark:text-amber-400',    bg: 'bg-amber-500/10',    border: 'border-amber-500/30' },
  medium: { label: 'Mencurigakan',      color: 'text-orange-600 dark:text-orange-400',  bg: 'bg-orange-500/10',   border: 'border-orange-500/30' },
  high:   { label: 'Sangat Mencurigakan', color: 'text-red-600 dark:text-red-400',      bg: 'bg-red-500/10',      border: 'border-red-500/30' },
};

/**
 * Analisis phishing pada sebuah email.
 * @param {Object} params
 * @param {string} params.from      - header From (display name <email>)
 * @param {string} params.replyTo   - header Reply-To (opsional)
 * @param {string} params.subject   - subjek email
 * @param {string} params.bodyHtml  - konten email (HTML)
 * @param {string} params.bodyPlain - konten plain text (opsional, fallback)
 * @returns {{ score: number, level: string, findings: string[] }}
 */
export function analyzePhishing({ from, replyTo, subject, bodyHtml, bodyPlain }) {
  const text = bodyPlain || bodyHtml || '';
  const combined = `${subject || ''} ${text}`;

  const urlList = extractUrls(bodyHtml || text);
  const urlResult = analyzeUrls(urlList);
  const headerResult = analyzeHeaders(from, replyTo);
  const contentResult = analyzeContent(combined);

  const totalScore = urlResult.score + headerResult.score + contentResult.score;
  const allFindings = [...urlResult.findings, ...headerResult.findings, ...contentResult.findings];

  let level = 'safe';
  if (totalScore >= 80) level = 'high';
  else if (totalScore >= 50) level = 'medium';
  else if (totalScore >= 20) level = 'low';

  return { score: totalScore, level, findings: allFindings };
}
