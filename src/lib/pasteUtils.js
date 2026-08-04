import DOMPurify from 'dompurify';

// ─── DOMPurify config ──────────────────────────────────────────────────────────
export const PURIFY_CONFIG = {
  ADD_ATTR: [
    'target', 'style', 'width', 'height', 'border', 'align', 'valign',
    'cellpadding', 'cellspacing', 'bgcolor', 'colspan', 'rowspan',
  ],
  ADD_TAGS: [
    'style', 'hr',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'colgroup', 'col',
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};

/** Baca File sebagai base64 data URL */
export function readFileAsBase64(file) {
  return new Promise(resolve => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result);
    r.readAsDataURL(file);
  });
}

/** Baca array File sebagai base64 data URLs. */
export function readFilesAsBase64(files) {
  return Promise.all(Array.from(files).map(f => readFileAsBase64(f).then(dataUrl => ({ name: f.name.toLowerCase(), dataUrl }))));
}

/**
 * Insert HTML ke cursor position menggunakan Range API modern.
 * Menggantikan document.execCommand('insertHTML') yang deprecated.
 */
export function insertHtmlAtCursor(html, containerEl) {
  if (!containerEl) return false;
  const sel = window.getSelection();
  if (!sel) return false;

  containerEl.focus();

  let range;
  if (sel.rangeCount > 0) {
    range = sel.getRangeAt(0);
    if (!containerEl.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(containerEl);
      range.collapse(false);
    }
  } else {
    range = document.createRange();
    range.selectNodeContents(containerEl);
    range.collapse(false);
  }

  range.deleteContents();

  const safeHtml = DOMPurify.sanitize(html, PURIFY_CONFIG);
  const fragment = range.createContextualFragment(safeHtml);
  const lastNode = fragment.lastChild || fragment;
  range.insertNode(fragment);

  range.setEndAfter(lastNode);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);

  return true;
}

/**
 * Ganti src="cid:..." di HTML dengan dataUrl yang sesuai.
 */
export function resolveCidSrcs(html, images) {
  if (!images || !images.length) return html;
  let idx = 0;
  return html.replace(/src="cid:([^"]+)"/gi, (_match, cid) => {
    const cidLower = cid.toLowerCase();
    const byName = images.find(img => img.name && cidLower.includes(img.name.replace(/\.[^.]+$/, '')));
    if (byName) return `src="${byName.dataUrl}"`;
    if (idx < images.length) return `src="${images[idx++].dataUrl}"`;
    return _match;
  });
}

/**
 * Insert image file sebagai base64 ke dalam editor.
 */
export async function insertImageFile(file, editorRef, onChange) {
  if (!file || !file.type.startsWith('image/')) return false;
  const dataUrl = await readFileAsBase64(file);
  if (!editorRef.current) return false;
  const ok = insertHtmlAtCursor(`<img src="${dataUrl}" style="max-width:100%;height:auto">`, editorRef.current);
  if (ok) onChange?.(DOMPurify.sanitize(editorRef.current.innerHTML, PURIFY_CONFIG));
  return ok;
}

function getImageFilesFromClipboard(dt) {
  const files = [];

  if (dt.items) {
    for (const item of dt.items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
  }

  if (files.length === 0 && dt.files && dt.files.length > 0) {
    for (const f of dt.files) {
      if (f.type.startsWith('image/')) files.push(f);
    }
  }

  return files;
}

async function tryReadClipboardImages() {
  if (!navigator.clipboard?.read) return [];
  try {
    const items = await navigator.clipboard.read();
    const files = [];
    for (const item of items) {
      for (const type of item.types) {
        if (type.startsWith('image/')) {
          const blob = await item.getType(type);
          if (blob) files.push(new File([blob], `clipboard-image.${type.split('/')[1] || 'png'}`, { type }));
        }
      }
    }
    return files;
  } catch {
    return [];
  }
}

/**
 * Handler paste universal untuk editor HTML.
 * Mengembalikan: null = biarkan browser | 'ok' | 'cid-warning'
 */
export async function handleEditorPaste(e, { editorRef, onChange, setIsPasting, onCidWarning }) {
  const dt = e.clipboardData;
  if (!dt) return null;

  const htmlData = dt.getData('text/html');

  let imageFiles = getImageFilesFromClipboard(dt);

  if (htmlData) {
    e.preventDefault();
    setIsPasting?.(true);

    const hasCid  = /src="cid:/i.test(htmlData);
    const hasImg  = /<img\s/i.test(htmlData);
    let resolvedHtml = htmlData;
    let hadUnresolvedCid = false;

    if (hasCid) {
      if (imageFiles.length > 0) {
        const images = await readFilesAsBase64(imageFiles);
        resolvedHtml = resolveCidSrcs(htmlData, images);
      } else {
        const clipboardImages = await tryReadClipboardImages();
        if (clipboardImages.length > 0) {
          imageFiles = clipboardImages;
          const images = await readFilesAsBase64(clipboardImages);
          resolvedHtml = resolveCidSrcs(htmlData, images);
        } else {
          resolvedHtml = htmlData.replace(/src="cid:[^"]+"/gi, 'src="" style="display:none"');
          hadUnresolvedCid = true;
        }
      }
    } else if (hasImg && imageFiles.length > 0) {
      const images = await readFilesAsBase64(imageFiles);
      resolvedHtml = htmlData.replace(/<img\s[^>]*src="([^"]+)"/gi, (match, src) => {
        if (src.startsWith('data:')) return match;
        const replacement = images.find(img => src.toLowerCase().includes(img.name?.replace(/\.[^.]+$/, '')));
        if (replacement) return match.replace(src, replacement.dataUrl);
        return match;
      });
    }

    const clean = DOMPurify.sanitize(resolvedHtml, PURIFY_CONFIG);
    if (editorRef.current) {
      insertHtmlAtCursor(clean, editorRef.current);
      onChange?.(DOMPurify.sanitize(editorRef.current.innerHTML, PURIFY_CONFIG));
    }
    setIsPasting?.(false);

    if (hadUnresolvedCid) {
      onCidWarning?.();
    }
    return hadUnresolvedCid ? 'cid-warning' : 'ok';
  }

  if (imageFiles.length > 0) {
    e.preventDefault();
    setIsPasting?.(true);
    await insertImageFile(imageFiles[0], editorRef, onChange);
    setIsPasting?.(false);
    return 'ok';
  }

  setIsPasting?.(true);
  const clipboardImages = await tryReadClipboardImages();
  if (clipboardImages.length > 0) {
    e.preventDefault();
    await insertImageFile(clipboardImages[0], editorRef, onChange);
    setIsPasting?.(false);
    return 'ok';
  }
  setIsPasting?.(false);

  return null;
}
