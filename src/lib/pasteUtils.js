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
  FORCE_BODY: true,
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
  editorRef.current.focus();
  document.execCommand('insertHTML', false, `<img src="${dataUrl}" style="max-width:100%;height:auto">`);
  onChange?.(editorRef.current.innerHTML);
  return true;
}

/**
 * Handler paste universal untuk editor HTML.
 * Mengembalikan: null = biarkan browser | 'cid-warning' = ada cid yg tidak resolve
 */
export async function handleEditorPaste(e, { editorRef, onChange, setIsPasting, onCidWarning }) {
  const dt = e.clipboardData;
  if (!dt) return null;

  const htmlData = dt.getData('text/html');

  // Kumpulkan image files dari clipboard items
  const imageFiles = [];
  if (dt.items) {
    for (const item of dt.items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) imageFiles.push(f);
      }
    }
  }

  // ── Case 1 & 2: HTML paste ─────────────────────────────────────────────────
  if (htmlData) {
    e.preventDefault();
    setIsPasting?.(true);

    const hasCid = /src="cid:/i.test(htmlData);
    let resolvedHtml = htmlData;
    let hadUnresolvedCid = false;

    if (hasCid) {
      if (imageFiles.length > 0) {
        // Outlook / client dengan file items
        const images = await readFilesAsBase64(imageFiles);
        resolvedHtml = resolveCidSrcs(htmlData, images);
      } else {
        // Apple Mail: tidak ada image data di clipboard — strip cid: refs dan beri warning
        resolvedHtml = htmlData.replace(/src="cid:[^"]+"/gi, 'src="" style="display:none"');
        hadUnresolvedCid = true;
      }
    }

    const clean = DOMPurify.sanitize(resolvedHtml, PURIFY_CONFIG);
    if (editorRef.current) {
      editorRef.current.focus();
      document.execCommand('insertHTML', false, clean);
      onChange?.(editorRef.current.innerHTML);
    }
    setIsPasting?.(false);

    if (hadUnresolvedCid) {
      onCidWarning?.();
    }
    return hadUnresolvedCid ? 'cid-warning' : 'ok';
  }

  // ── Case 3: raw image file (screenshot, drag-drop) ─────────────────────────
  if (imageFiles.length > 0) {
    e.preventDefault();
    setIsPasting?.(true);
    await insertImageFile(imageFiles[0], editorRef, onChange);
    setIsPasting?.(false);
    return 'ok';
  }

  // ── Case 4: plain text / lainnya — biarkan browser ─────────────────────────
  return null;
}
