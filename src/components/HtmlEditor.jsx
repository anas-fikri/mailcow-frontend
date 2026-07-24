import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Bold, Italic, Underline, Link, Image } from 'lucide-react';

export default function HtmlEditor({ value, onChange, minHeight = 120, placeholder = '' }) {
  const editorRef = useRef(null);
  const mountedRef = useRef(false);

  /* Mount sekali — skip efek hydration setelahnya */
  useEffect(() => { mountedRef.current = true; }, []);

  /* Hydrate editor dengan initial value hanya saat mount pertama */
  useEffect(() => {
    if (editorRef.current && !editorRef.current._hydrated) {
      editorRef.current.innerHTML = value || '';
      editorRef.current._hydrated = true;
    }
  }, []); // sekali aja, gak peduli value berubah

  const exec = useCallback((cmd, val = null) => {
    document.execCommand(cmd, false, val);
    if (editorRef.current) {
      editorRef.current.focus();
      onChange?.(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handleInput = useCallback(() => {
    onChange?.(editorRef.current?.innerHTML || '');
  }, [onChange]);

  /* Paste handler: cari image dari files | items, konversi ke base64 */
  const handlePaste = useCallback((e) => {
    const dt = e.clipboardData;
    if (!dt) return;

    /* Cari file image dari clipboard */
    let file = null;
    if (dt.files?.length) {
      for (const f of dt.files) { if (f.type.startsWith('image/')) { file = f; break; } }
    }
    if (!file && dt.items) {
      for (const item of dt.items) { if (item.type.startsWith('image/')) { file = item.getAsFile(); break; } }
    }
    if (!file) return; /* bukan image paste — biarin browser handle default */

    e.preventDefault();
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== 'string' || !editorRef.current) return;
      editorRef.current.focus();
      document.execCommand('insertHTML', false, `<img src="${dataUrl}" style="max-width:100%;height:auto">`);
      onChange?.(editorRef.current.innerHTML);
    };
    reader.readAsDataURL(file);
  }, [onChange]);

  function insertLink() {
    const url = prompt('Masukkan URL:', 'https://');
    if (!url || !url.trim()) return;
    /* Wrap selected text or insert URL as clickable link */
    const sel = window.getSelection();
    if (sel && sel.toString().trim()) {
      exec('createLink', url.trim());
    } else {
      exec('insertHTML', `<a href="${url.trim()}">${url.trim()}</a>`);
    }
  }

  function insertImage() {
    const url = prompt('Masukkan URL gambar:', 'https://');
    if (!url || !url.trim()) return;
    exec('insertImage', url.trim());
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 bg-muted/30 border-b border-border/40 flex-wrap">
        <button type="button" title="Tebal" onMouseDown={e => { e.preventDefault(); exec('bold'); }}
          className="p-1 rounded hover:bg-border/60 text-muted-foreground hover:text-foreground transition-colors">
          <Bold size={15} />
        </button>
        <button type="button" title="Miring" onMouseDown={e => { e.preventDefault(); exec('italic'); }}
          className="p-1 rounded hover:bg-border/60 text-muted-foreground hover:text-foreground transition-colors">
          <Italic size={15} />
        </button>
        <button type="button" title="Garis bawah" onMouseDown={e => { e.preventDefault(); exec('underline'); }}
          className="p-1 rounded hover:bg-border/60 text-muted-foreground hover:text-foreground transition-colors">
          <Underline size={15} />
        </button>

        <div className="w-px h-4 bg-border/60 mx-1" />

        <button type="button" title="Tautan" onMouseDown={e => { e.preventDefault(); insertLink(); }}
          className="p-1 rounded hover:bg-border/60 text-muted-foreground hover:text-foreground transition-colors">
          <Link size={15} />
        </button>
        <button type="button" title="Gambar (dari URL)" onMouseDown={e => { e.preventDefault(); insertImage(); }}
          className="p-1 rounded hover:bg-border/60 text-muted-foreground hover:text-foreground transition-colors">
          <Image size={15} />
        </button>

        <span className="ml-auto text-[10px] text-muted-foreground/40 flex items-center gap-1">
          {pasting && <Loader2 size={12} className="animate-spin" />}
          HTML
        </span>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        className="px-4 py-3 text-sm leading-relaxed focus:outline-none overflow-y-auto"
        style={{ minHeight }}
        data-placeholder={placeholder}
      />
    </div>
  );
}
