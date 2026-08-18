/**
 * Klasifikasi email client-side (tanpa header tambahan dari SOGo).
 *
 * Hanya memakai data yang sudah ada di daftar pesan (list view):
 *   - folder id (folderJunk = spam)
 *   - from (email pengirim → domain)
 *   - subject (kata kunci promosi/notifikasi)
 *
 * Tujuan: memberi tab cepat "Utama / Promosi / Sosial / Update" + badge,
 * seperti Gmail/Outlook Focused inbox — tanpa mengubah request ke SOGo
 * (list view tidak mengembalikan header List-Unsubscribe/X-Spam-*).
 *
 * Kategori:
 *   spam    → folder Junk/Spam (Mailcow/Rspamd sudah menyaring)
 *   sosial  → domain media sosial yang dikenal
 *   promo   → domain newsletter/marketing yang dikenal ATAU kata kunci subjek
 *   update  → domain notifikasi/no-reply yang dikenal ATAU kata kunci update
 *   utama   → sisanya (default, termasuk email personal)
 *
 * Prioritas pengecekan: spam > sosial > promo > update > utama.
 * Domain dicek sebagai substring dari sender email (tanpa www.).
 */

export const EMAIL_CATEGORIES = {
  UTAMA: 'utama',
  PROMO: 'promo',
  SOSIAL: 'sosial',
  UPDATE: 'update',
  SPAM: 'spam',
};

export const CATEGORY_LABELS = {
  [EMAIL_CATEGORIES.UTAMA]: 'Utama',
  [EMAIL_CATEGORIES.PROMO]: 'Promosi',
  [EMAIL_CATEGORIES.SOSIAL]: 'Sosial',
  [EMAIL_CATEGORIES.UPDATE]: 'Update',
  [EMAIL_CATEGORIES.SPAM]: 'Spam',
};

// Badge class ringkas utk tampil di baris pesan (Tailwind, light/dark aman).
export const CATEGORY_BADGE_CLASS = {
  [EMAIL_CATEGORIES.PROMO]: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  [EMAIL_CATEGORIES.SOSIAL]: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  [EMAIL_CATEGORIES.UPDATE]: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
  [EMAIL_CATEGORIES.SPAM]: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

// Domain media sosial (substring cocok; tanpa www. di awal).
const SOCIAL_DOMAINS = [
  'facebookmail.com', 'facebook.com', 'fb.com',
  'twitter.com', 'x.com', 'twtr.io',
  'linkedin.com', 'linkedin-mail.com',
  'instagram.com', 'instagrammail.com',
  'youtube.com', 'youtubemail.com',
  'tiktok.com', 'tiktokmail.com',
  'whatsapp.com', 'whatsapp.net',
  'telegram.org', 'discord.com', 'discordmail.com',
  'pinterest.com', 'snapchat.com', 'reddit.com',
  'medium.com', 'substack.com', 'behance.net', 'dribbble.com',
];

// Domain newsletter/marketing yang dikenal (substring cocok).
const PROMO_DOMAINS = [
  'mailchimp.com', 'mcsv.net', 'mandrillapp.com',
  'sendinblue.com', 'sendinblue-mail.com', 'brevo.com',
  'mailgun.com', 'mailgun.org',
  'sendgrid.net', 'sendgrid.com',
  'mailerlite.com', 'mailercloud.com', 'mailjet.com',
  'constantcontact.com', 'campaignmonitor.com',
  'klaviyo.com', 'klaviyomail.com',
  'hubspot.com', 'hubspotemail.net',
  'pipedrive.com', 'zoho.com', 'zoho.eu',
  'benchmarkemail.com', 'aweber.com', 'getresponse.com',
  'activecampaign.com', 'convertkit.com', 'buttondown.email',
  'newsletter.', 'newsletters.', 'bulk.', 'marketing.', 'promo.',
];

// Domain notifikasi/no-reply/transaksional yang dikenal (substring cocok).
const UPDATE_DOMAINS = [
  'no-reply', 'no_reply', 'noreply', 'donotreply', 'do-not-reply',
  'notifications', 'notification.',
  'github.com', 'gitlab.com', 'bitbucket.org',
  'paypal.com', 'paypal.co.id', 'stripe.com', 'stripe-mail.com',
  'amazon.com', 'amazon.co.id', 'aws.amazon.com',
  'google.com', 'googlemail.com', 'cloud.google.com',
  'microsoft.com', 'outlook.com', 'office365.com',
  'shopify.com', 'woocommerce.com', 'tokopedia.com', 'shopee.co.id',
  'tokopedia-mail.com', 'shopee.com', 'lazada.co.id', 'bukalapak.com',
  'blibli.com', 'jne.co.id', 'jnt.co.id', 'sicepat.com', 'antar.id',
  'bca.co.id', 'bni.co.id', 'bri.co.id', 'mandiri.co.id', 'cimbniaga.co.id',
  'gojek.com', 'grab.com', 'traveloka.com', 'tiket.com', 'agoda.com',
  'zoom.us', 'meet.google.com', 'teams.microsoft.com', 'slack.com',
  'dropbox.com', 'googledrive.com', 'onedrive.com', 'wetransfer.com',
  'figma.com', 'notion.so', 'trello.com', 'asana.com', 'canva.com',
];

// Kata kunci subjek utk promosi (bahasa Indonesia + Inggris umum).
const PROMO_SUBJECT_KEYWORDS = [
  'promo', 'diskon', 'discount', 'sale', 'obral', 'voucher', 'kupon',
  'newsletter', 'buletin', 'penawaran', 'offer', 'spesial', 'special',
  'flash sale', 'clearance', 'cashback', 'bundling', 'gratis', 'free trial',
  'jangan lewatkan', 'dont miss', 'terbatas', 'limited', 'harga spesial',
  'gajian', 'payday', 'big sale', 'akhir pekan', 'weekend', 'beli 1',
  'buy 1', 'paket hemat', 'wow', 'serba 50', 'up to',
];

// Kata kunci subjek utk update/notifikasi.
// Hanya frasa yang cukup spesifik — hindari kata generik (update/login/pin)
// yang sering muncul di email personal tanpa arti notifikasi.
const UPDATE_SUBJECT_KEYWORDS = [
  'verifikasi', 'verification', 'kode otp', 'otp', 'kode keamanan',
  'security code', 'sign in', 'masuk akun', 'aktivasi', 'activate',
  'konfirmasi', 'confirmation', 'pemberitahuan', 'notification', 'notifikasi',
  'invoice', 'faktur', 'kwitansi', 'receipt', 'pembayaran', 'payment',
  'tagihan', 'bill', 'pengiriman', 'delivery', 'shipping', 'resi',
  'reset password', 'password reset', 'sandi', 'akun anda', 'akun kamu',
  '2fa', 'two-factor', 'two factor', 'laporan', 'report', 'rangkuman',
  'pembaruan', 'changelog', 'pemeliharaan', 'maintenance', 'kode verifikasi',
  'kode konfirmasi', 'one-time', 'sekali pakai', 'masuk dari perangkat',
];

/** Ambil domain dari string alamat (mis. "Nama <a@b.com>" atau "a@b.com"). */
export function extractEmailDomain(fromValue) {
  const text = String(fromValue || '');
  const match = text.match(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  const domain = (match ? match[1] : text).toLowerCase();
  return domain.replace(/^www\./, '');
}

function lowerSubject(subject) {
  return String(subject || '').toLowerCase();
}

/** Cocokkan kata kunci dengan batas kata (\b) — "promo" cocok "promo",
 *  tidak cocok "promosi"?  Sebaliknya: kita mau "promosi" juga kena.
 *  Pakai regex \b utk frasa; kata tunggal pendek (<5 huruf) dicocokkan
 *  dengan includes agar varian (promo/promosi, update/updated) tertangkap
 *  — kecuali kata ambigu yang sudah disaring dari daftar. */
function subjectMatches(subject, keywords) {
  const s = lowerSubject(subject);
  if (!s) return false;
  return keywords.some((k) => {
    const phrase = k.toLowerCase();
    if (phrase.includes(' ')) {
      return s.includes(phrase);
    }
    if (phrase.length < 5) {
      // Kata pendek: cocok sebagai kata utuh saja (batas kata).
      const re = new RegExp(`(^|[^a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`);
      return re.test(s);
    }
    // Kata panjang: includes menangkap varian (promo→promosi, update→updates).
    return s.includes(phrase);
  });
}

function domainMatches(domain, list) {
  return list.some((d) => domain.includes(d));
}

/**
 * Klasifikasi satu pesan.
 * @param {object} msg  baris pesan hasil parseMessageRow + folderId
 *   { folderId, from, subject, ... }
 * @returns {string} salah satu dari EMAIL_CATEGORIES
 */
export function classifyEmail(msg = {}) {
  if (!msg || typeof msg !== 'object') return EMAIL_CATEGORIES.UTAMA;
  const folderId = String(msg.folderId || '');
  if (folderId === 'folderJunk' || /junk|spam/i.test(folderId)) {
    return EMAIL_CATEGORIES.SPAM;
  }

  const domain = extractEmailDomain(msg.from);

  // Sosial dulu — media sosial tidak boleh masuk promo walau ada kata "promo".
  if (domainMatches(domain, SOCIAL_DOMAINS)) return EMAIL_CATEGORIES.SOSIAL;

  if (domainMatches(domain, PROMO_DOMAINS) ||
      subjectMatches(msg.subject, PROMO_SUBJECT_KEYWORDS)) {
    return EMAIL_CATEGORIES.PROMO;
  }

  if (domainMatches(domain, UPDATE_DOMAINS) ||
      subjectMatches(msg.subject, UPDATE_SUBJECT_KEYWORDS)) {
    return EMAIL_CATEGORIES.UPDATE;
  }

  return EMAIL_CATEGORIES.UTAMA;
}

/** Jumlah pesan per kategori (untuk counter di tab). */
export function countCategories(messages = []) {
  const counts = Object.fromEntries(
    Object.values(EMAIL_CATEGORIES).map((c) => [c, 0])
  );
  for (const msg of messages) counts[classifyEmail(msg)] += 1;
  return counts;
}
