import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Bold, Italic, Underline, Link, ImagePlus, Loader2, AlertTriangle, X } from 'lucide-react';
import { handleEditorPaste, insertImageFile } from '../lib/pasteUtils';

export default function HtmlEditor({ value, onChange, minHeight = 120, placeholder = '' }) {
  const editorRef    = useRef(null);
  const fileInputRef = useRef(null);
  const [isPasting, setIsPasting] = useState(false);
  const [cidWarning, setCidWarning] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  /* Hydrate hanya saat mount pertama */
  useEffect(() => {
    if (editorRef.current && !editorRef.current._hydrated) {
      editorRef.current.innerHTML = value || '';
      editorRef.current._hydrated = true;
    }
  }, []);

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

  const onPaste = useCallback((e) => {
    handleEditorPaste(e, {
      editorRef,
      onChange,
      setIsPasting,
      onCidWarning: () => setCidWarning(true),
    });
  }, [onChange]);

  // Drag-and-drop image
  const onDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);
  const onDragLeave = useCallback(() => setIsDragOver(false), []);
  const onDrop = useCallback(async (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
    if (file) {
      setIsPasting(true);
      await insertImageFile(file, editorRef, onChange);
      setIsPasting(false);
    }
  }, [onChange]);

  // File picker upload
  const onFileSelected = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsPasting(true);
    await insertImageFile(file, editorRef, onChange);
    setIsPasting(false);
    e.target.value = '';
  }, [onChange]);

  function insertLink() {
    const url = prompt('Masukkan URL:', 'https://');
    if (!url || !url.trim()) return;
    const sel = window.getSelection();
    if (sel && sel.toString().trim()) {
      exec('createLink', url.trim());
    } else {
      exec('insertHTML', `<a href="${url.trim()}">${url.trim()}</a>`);
    }
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

        {/* Upload Gambar dari file */}
        <button
          type="button"
          title="Upload Gambar dari File"
          onClick={e => { e.preventDefault(); fileInputRef.current?.click(); }}
          className="p-1 rounded hover:bg-border/60 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ImagePlus size={15} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFileSelected}
        />

        <span className="ml-auto text-[10px] text-muted-foreground/40 flex items-center gap-1">
          {isPasting && <Loader2 size={12} className="animate-spin" />}
          HTML
        </span>
      </div>

      {/* Warning CID */}
      {cidWarning && (
        <div className="flex items-start gap-2 px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span className="flex-1">
            <strong>Gambar tidak disertakan</strong> — clipboard tidak menyertakan data gambar. 
            Gunakan tombol <strong>Upload Gambar (↑)</strong> untuk menambahkan gambar dari file, atau drag &amp; drop gambar ke editor.
          </span>
          <button onClick={() => setCidWarning(false)} className="shrink-0 hover:opacity-70">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={onPaste}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`px-4 py-3 text-sm leading-relaxed focus:outline-none overflow-y-auto transition-colors ${
          isDragOver ? 'bg-primary/5 ring-2 ring-primary/30 ring-inset' : ''
        }`}
        style={{ minHeight }}
        data-placeholder={placeholder}
      />
    </div>
  );
}
