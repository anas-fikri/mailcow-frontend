const LOGIN_ERROR_MESSAGES = {
  400: 'Format permintaan login tidak diterima server. Coba refresh halaman dan ulangi.',
  401: 'Email atau password tidak valid.',
  403: 'Login ditolak SOGo. Periksa email/password, status mailbox aktif, dan apakah akun diwajibkan mengganti password.',
  429: 'Terlalu banyak percobaan login. Tunggu beberapa menit lalu coba lagi.',
  500: 'Server email mengalami kendala saat login. Coba lagi beberapa saat lagi.',
  502: 'Gateway email tidak dapat terhubung ke SOGo. Hubungi administrator.',
  503: 'Layanan SOGo sedang tidak tersedia. Coba lagi beberapa saat lagi.',
};

function normalizeMessage(value) {
  if (typeof value !== 'string') return '';
  const message = value.replace(/\s+/g, ' ').trim();
  if (!message || /<[^>]*>/.test(message) || message.length > 240) return '';
  return message;
}

// ── Network error detection & friendly message ────────────────────────────────
// fetch yang gagal di level jaringan (DNS/offline/connection reset/timeout)
// melempar TypeError/AbortError TANPA status HTTP. Jangan tampilkan teks mentah
// browser ("Failed to fetch"/"NetworkError") ke user — petakan ke pesan jelas.
const NETWORK_ERROR_RE = /failed to fetch|networkerror|load failed|fetch failed|network request failed|err_internet|err_network|network is unreachable|connection refused|connection reset|the user aborted|timeout/i;

/**
 * True bila error adalah kegagalan jaringan/abort (bukan respons HTTP).
 * Error dengan status HTTP (err.status) punya pesan spesifik sendiri.
 */
export function isNetworkError(err) {
  if (!err) return false;
  if (err.status) return false;
  const name = String(err?.name || '').toLowerCase();
  if (name === 'aborterror' || name === 'timeouterror') return true;
  const msg = String(err?.message || err);
  return NETWORK_ERROR_RE.test(msg);
}

/**
 * Ubah error login jadi pesan ramah user. Network error → instruksi jelas;
 * error lain dibiarkan apa adanya (sudah dipetakan extractLoginErrorMessage).
 */
export function friendlyLoginError(err) {
  if (isNetworkError(err)) {
    return 'Tidak dapat terhubung ke server email. Periksa koneksi internet atau VPN Anda, lalu coba lagi.';
  }
  return err?.message || 'Login gagal. Periksa koneksi dan status akun.';
}

export function extractLoginErrorMessage(data, status) {
  const raw = normalizeMessage(
    data?.message || data?.error || data?.reason || data?.localizedError
  );
  const text = raw.toLowerCase();

  if (/ldappasswordpolicyerror|password.{0,20}(change|expired)|must.{0,20}change/.test(text)) {
    return 'Akun diwajibkan mengganti password sebelum dapat login.';
  }
  if (/inactive|disabled|disallow.{0,20}login|login.{0,20}(disabled|forbidden)/.test(text)) {
    return 'Mailbox tidak aktif atau login akun dinonaktifkan oleh administrator.';
  }
  if (/wrong.{0,20}(user|password)|invalid.{0,20}(credential|password)|authentication.{0,20}fail/.test(text)) {
    return 'Email atau password tidak valid.';
  }
  if (/too many|rate limit|temporarily blocked/.test(text)) {
    return LOGIN_ERROR_MESSAGES[429];
  }

  return LOGIN_ERROR_MESSAGES[status] || `Login gagal (HTTP ${status}).`;
}

export function isUnsupportedLoginFormat(status, data) {
  // These statuses explicitly mean the request representation is unsupported.
  if ([415, 422].includes(status)) return true;
  if (status !== 400) return false;
  const text = normalizeMessage(data?.message || data?.error || data?.reason).toLowerCase();
  return /content[- ]?type|media[- ]?type|json|payload|form|request body|unsupported/.test(text);
}

export function isLoginSuccessResponse(res, { isJson = false, data, isEmpty = false, isHtml = false } = {}) {
  // SOGo versions vary: some return JSON, others return an empty 200 response
  // and signal success through Set-Cookie (not readable by browser JavaScript).
  // With redirect: 'manual', native SOGo may expose a same-origin 302 after
  // setting the session cookie. The protected mailbox warm-up remains the
  // authoritative proof, so accept only redirect statuses here as candidates.
  const status = res?.status;
  const candidateStatus = res?.ok || (status >= 300 && status < 400 && status !== 304);
  if (!candidateStatus || status === 204) return false;
  if (isHtml) return false;
  if (isEmpty) return true;
  if (!isJson || !data || typeof data !== 'object' || Array.isArray(data)) return false;
  if (data.error || data.message || data.reason || data.authenticated === false || data.success === false) return false;
  return Boolean(
    (typeof data.username === 'string' && data.username.trim()) ||
    (typeof data.userName === 'string' && data.userName.trim()) ||
    (typeof data.cn === 'string' && data.cn.trim()) ||
    data.authenticated === true ||
    data.success === true
  );
}
