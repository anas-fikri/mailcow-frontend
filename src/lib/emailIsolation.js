/**
 * Isolasi HTML email dari UI aplikasi.
 *
 * HTML email dirender inline (bukan iframe). Tanpa isolasi, email bisa:
 *   - <style> global → menyembunyikan/mengubah UI webmail (CSS berlaku ke app);
 *   - <form>/<input> + position:fixed → form login palsu menutupi seluruh layar.
 *
 * Pertahanan berlapis:
 *   1. EMAIL_FORBID_TAGS: elemen interaktif/berbahaya dibuang DOMPurify.
 *   2. scopeEmailStyles(): setiap selector <style> di-prefix `.email-body`,
 *      @import/@font-face/@keyframes dibuang, position:fixed/sticky dinetralkan.
 *   3. CSS `.email-body { contain: layout; isolation: isolate }` (index.css):
 *      wrapper jadi containing block utk fixed/absolute → overlay terkurung.
 */

export const EMAIL_FORBID_TAGS = Object.freeze([
  'form', 'input', 'button', 'select', 'option', 'optgroup', 'textarea', 'datalist',
  'iframe', 'frame', 'frameset', 'object', 'embed', 'dialog', 'base', 'meta', 'link',
]);

export const EMAIL_SCOPE = '.email-body';

const DANGEROUS_POSITION = /position\s*:\s*(fixed|sticky)/gi;

/** Netralkan position:fixed/sticky dalam teks deklarasi CSS (atribut style / rule). */
export function neutralizeStyleText(css) {
  return String(css || '').replace(DANGEROUS_POSITION, 'position: static');
}

/** Prefix setiap selector dalam daftar dipisah koma dengan scope. */
export function scopeSelectorList(selectorText, scope = EMAIL_SCOPE) {
  return String(selectorText)
    .split(',')
    .map((sel) => {
      const s = sel.trim();
      if (!s) return '';
      // :root/html/body milik dokumen app → arahkan ke wrapper email.
      const rewritten = s.replace(/^(:root|html|body)\b/i, '');
      return rewritten ? `${scope} ${rewritten.trim()}` : scope;
    })
    .filter(Boolean)
    .join(', ');
}

/**
 * Tulis ulang isi <style> email agar hanya berlaku di dalam wrapper email.
 * Memakai CSSOM browser (CSSStyleSheet.replaceSync). Bila tidak tersedia
 * (Node/test, browser lama) → kembalikan '' (style dibuang: aman, bukan bocor).
 */
export function scopeEmailStyles(cssText, scope = EMAIL_SCOPE) {
  const Sheet = globalThis.CSSStyleSheet;
  if (typeof Sheet !== 'function') return '';
  let sheet;
  try {
    sheet = new Sheet();
    sheet.replaceSync(String(cssText || ''));
  } catch {
    return '';
  }
  const out = [];
  const walk = (rules, sink) => {
    for (const rule of Array.from(rules || [])) {
      // CSSStyleRule
      if (rule.selectorText !== undefined && rule.style) {
        sink.push(`${scopeSelectorList(rule.selectorText, scope)} { ${neutralizeStyleText(rule.style.cssText)} }`);
      } else if (rule.media && rule.cssRules) {
        // @media — pertahankan (layout responsif email), scope isinya.
        const inner = [];
        walk(rule.cssRules, inner);
        if (inner.length) sink.push(`@media ${rule.media.mediaText} { ${inner.join(' ')} }`);
      }
      // @import, @font-face, @keyframes, @supports, @page, dll → dibuang.
    }
  };
  walk(sheet.cssRules, out);
  return out.join('\n');
}

/**
 * Hook DOMPurify (uponSanitizeElement + afterSanitizeAttributes) yang
 * menerapkan scoping. Dipasang hanya selama sanitize HTML email.
 */
export function makeEmailIsolationHooks(scope = EMAIL_SCOPE) {
  return {
    uponSanitizeElement(node, data) {
      if (data.tagName === 'style') {
        node.textContent = scopeEmailStyles(node.textContent, scope);
      }
    },
    afterSanitizeAttributes(node) {
      if (node.hasAttribute?.('style')) {
        node.setAttribute('style', neutralizeStyleText(node.getAttribute('style')));
      }
    },
  };
}

/** Sanitasi HTML email dengan isolasi (hook dipasang sementara lalu dilepas). */
export function sanitizeEmailHtml(purify, html, config, scope = EMAIL_SCOPE) {
  const hooks = makeEmailIsolationHooks(scope);
  purify.addHook('uponSanitizeElement', hooks.uponSanitizeElement);
  purify.addHook('afterSanitizeAttributes', hooks.afterSanitizeAttributes);
  try {
    return purify.sanitize(html, {
      ...config,
      FORBID_TAGS: [...(config.FORBID_TAGS || []), ...EMAIL_FORBID_TAGS],
    });
  } finally {
    purify.removeHook('afterSanitizeAttributes', hooks.afterSanitizeAttributes);
    purify.removeHook('uponSanitizeElement', hooks.uponSanitizeElement);
  }
}
