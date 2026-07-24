import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Send, Paperclip, ChevronDown, ChevronUp,
  Loader2, AlertCircle, Bold, Italic, Underline,
  List, ListOrdered, Heading1, Indent, IndentDecrease
} from 'lucide-react';
import { sendMessage, fetchContacts, fetchPreferences } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DOMPurify from 'dompurify';

export default function ComposeModal({ isOpen, onClose, initialData = null, sogoToken, userFrom = '' }) {
  const { user, smtpCreds } = useAuthStore();
  const queryClient = useQueryClient();
  const token = sogoToken || user?.sogoToken;

  const [to, setTo]           = useState('');
  const [cc, setCc]           = useState('');
  const [bcc, setBcc]         = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody]       = useState('');
  const [showCc, setShowCc]   = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState(false);

  const [showToSugg, setShowToSugg]  = useState(false);
  const [showCcSugg, setShowCcSugg]  = useState(false);
  const [showBccSugg, setShowBccSugg] = useState(false);

  // Ambil kontak untuk autocomplete
  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts', token],
    queryFn: () => fetchContacts(token),
    enabled: !!token,
    staleTime: 5 * 60_000,
  });

  // Ambil preferences (signature, dll)
  const { data: prefs } = useQuery({
    queryKey: ['preferences', token],
    queryFn: () => fetchPreferences(token),
    enabled: !!token,
    staleTime: 5 * 60_000,
  });

  // Ref untuk mencegah double-inject signature
  const sigInjected = useRef(false);

  // Reset form saat dibuka / initialData berubah
  useEffect(() => {
    if (isOpen) {
      sigInjected.current = false;
      setTo(initialData?.to || '');
      setCc(initialData?.cc || '');
      setBcc(initialData?.bcc || '');
      setSubject(initialData?.subject || '');
      setBody(initialData?.body || '');
      setShowCc(!!initialData?.cc);
      setShowBcc(!!initialData?.bcc);
      setError('');
      setSuccess(false);
      setSending(false);
    }
  }, [isOpen, initialData]);

  // Inject HTML signature setelah body di-reset dan prefs tersedia
  useEffect(() => {
    if (!isOpen || sigInjected.current || !prefs) return;
    const sigHtml = prefs?.defaults?.SOGoMailSignature;
    const enabled = prefs?.defaults?.SOGoMailSignatureEnabled === '1';
    if (sigHtml && enabled) {
      setBody(cur => {
        if (cur.includes(sigHtml.substring(0, 80))) return cur;
        const bqIdx = cur.indexOf('<blockquote');
        const sigBlock = `<br>--<br>${sigHtml}`;
        return bqIdx > 0
          ? cur.slice(0, bqIdx) + sigBlock + cur.slice(bqIdx)
          : cur + sigBlock;
      });
    }
    sigInjected.current = true;
  }, [isOpen, prefs]);

  // ── Autocomplete ────────────────────────────────────────────────────────────

  function getSuggestions(fieldValue) {
    if (!fieldValue) return [];
    const lastWord = fieldValue.split(',').pop().trim().toLowerCase();
    if (lastWord.length < 2) return [];

    return contacts
      .filter(c => {
        const name  = c.name  || c.c_cn  || (Array.isArray(c) ? c[1] : '') || '';
        const email = c.email || c.c_mail || (Array.isArray(c) ? c[2] : '') || '';
        return `${name} ${email}`.toLowerCase().includes(lastWord);
      })
      .slice(0, 6);
  }

  function selectContact(contact, fieldValue, setField, setShow) {
    const name  = contact.name  || contact.c_cn  || (Array.isArray(contact) ? contact[1] : '') || '';
    const email = contact.email || contact.c_mail || (Array.isArray(contact) ? contact[2] : '') || '';
    const str   = name ? `${name.replace(/,/g, '')} <${email}>` : email;

    const parts = fieldValue.split(',').map(p => p.trim());
    parts.pop();
    parts.push(str);
    setField(parts.join(', ') + ', ');
    setShow(false);
  }

  // ── Send ────────────────────────────────────────────────────────────────────

  async function handleSend(e) {
    e.preventDefault();
    if (!to.trim()) { setError('Kolom "Kepada" wajib diisi.'); return; }

    setSending(true);
    setError('');
    setSuccess(false);
    try {
      await sendMessage(token, {
        to: to.trim(),
        cc: cc.trim(),
        bcc: bcc.trim(),
        subject: subject.trim(),
        body: DOMPurify.sanitize(body, { ALLOW_DATA_URI: true }),
        isHTML: true,
        from: userFrom,
      }, smtpCreds);
      setSuccess(true);
      // Refresh Sent folder setelah sukses kirim
      queryClient.invalidateQueries({ queryKey: ['messages', token, 'folderSent'] });
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setError(err.message || 'Gagal mengirim pesan.');
    } finally {
      setSending(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full h-[90vh] sm:h-auto sm:max-h-[85vh] sm:max-w-2xl bg-background flex flex-col rounded-t-2xl sm:rounded-xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card">
              <h2 className="text-base font-semibold">Tulis Pesan</h2>
              <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSend} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto">

                {/* Error / Success */}
                {error && (
                  <div className="mx-4 mt-4 p-3 bg-destructive/10 text-destructive text-sm rounded-lg flex items-start gap-2">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    {error}
                  </div>
                )}
                {success && (
                  <div className="mx-4 mt-4 p-3 bg-green-500/10 text-green-600 dark:text-green-400 text-sm rounded-lg">
                    ✓ Email berhasil dikirim!
                  </div>
                )}

                {/* Fields */}
                <div className="px-5 py-3 space-y-0 border-b border-border">

                  {/* To */}
                  <div className="relative py-2 flex items-center border-b border-border/60">
                    <label className="text-sm font-medium w-16 text-muted-foreground shrink-0">Kepada:</label>
                    <input
                      type="text"
                      value={to}
                      onChange={e => { setTo(e.target.value); setShowToSugg(true); }}
                      onBlur={() => setTimeout(() => setShowToSugg(false), 200)}
                      className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-sm"
                      placeholder="nama@domain.com"
                      autoComplete="off"
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowCc(v => !v)}
                        className={`text-xs flex items-center gap-0.5 ${
                          showCc ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Cc {showCc ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowBcc(v => !v)}
                        className={`text-xs flex items-center gap-0.5 ${
                          showBcc ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Bcc {showBcc ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                    </div>
                    {showToSugg && getSuggestions(to).length > 0 && (
                      <SuggestionList
                        items={getSuggestions(to)}
                        onSelect={c => selectContact(c, to, setTo, setShowToSugg)}
                      />
                    )}
                  </div>

                  {/* Cc */}
                  {showCc && (
                    <div className="relative py-2 flex items-center border-b border-border/60">
                      <label className="text-sm font-medium w-16 text-muted-foreground shrink-0">Cc:</label>
                      <input
                        type="text"
                        value={cc}
                        onChange={e => { setCc(e.target.value); setShowCcSugg(true); }}
                        onBlur={() => setTimeout(() => setShowCcSugg(false), 200)}
                        className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-sm"
                        placeholder="cc@domain.com"
                        autoComplete="off"
                      />
                      {showCcSugg && getSuggestions(cc).length > 0 && (
                        <SuggestionList
                          items={getSuggestions(cc)}
                          onSelect={c => selectContact(c, cc, setCc, setShowCcSugg)}
                        />
                      )}
                    </div>
                  )}

                  {/* Bcc */}
                  {showBcc && (
                    <div className="relative py-2 flex items-center border-b border-border/60">
                      <label className="text-sm font-medium w-16 text-muted-foreground shrink-0">Bcc:</label>
                      <input
                        type="text"
                        value={bcc}
                        onChange={e => { setBcc(e.target.value); setShowBccSugg(true); }}
                        onBlur={() => setTimeout(() => setShowBccSugg(false), 200)}
                        className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-sm"
                        placeholder="bcc@domain.com"
                        autoComplete="off"
                      />
                      {showBccSugg && getSuggestions(bcc).length > 0 && (
                        <SuggestionList
                          items={getSuggestions(bcc)}
                          onSelect={c => selectContact(c, bcc, setBcc, setShowBccSugg)}
                        />
                      )}
                    </div>
                  )}

                  {/* Subject */}
                  <div className="py-2 flex items-center">
                    <label className="text-sm font-medium w-16 text-muted-foreground shrink-0">Subjek:</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={e => setSubject(e.target.value)}
                      className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-sm font-medium"
                      placeholder="Subjek pesan..."
                    />
                  </div>
                </div>

                {/* Body — Rich Editor */}
                <RichEditor value={body} onChange={setBody} />
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-card">
                <button
                  type="button"
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                  title="Lampirkan file (belum didukung)"
                  disabled
                >
                  <Paperclip size={18} />
                </button>
                <button
                  type="submit"
                  disabled={sending || success}
                  className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium transition-colors disabled:opacity-60 text-sm"
                >
                  {sending
                    ? <><Loader2 size={16} className="animate-spin" /> Mengirim...</>
                    : success
                      ? '✓ Terkirim'
                      : <><Send size={16} /> Kirim</>}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Rich Editor (contentEditable + formatting toolbar) ──────────────────────────

function RichEditor({ value, onChange }) {
  const editorRef = useRef(null);
  const [isMounted, setIsMounted] = useState(false);
  const [showHeading, setShowHeading] = useState(false);
  const headingRef = useRef(null);

  // Hydrate editor content on mount / external value change
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (editorRef.current && isMounted && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value, isMounted]);

  const exec = useCallback((cmd, val = null) => {
    document.execCommand(cmd, false, val);
    if (editorRef.current) {
      editorRef.current.focus();
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;');
    }
  }, []);

  const toolbar = [
    { icon: Bold,    cmd: 'bold',      title: 'Tebal (Ctrl+B)' },
    { icon: Italic,  cmd: 'italic',    title: 'Miring (Ctrl+I)' },
    { icon: Underline, cmd: 'underline', title: 'Garis bawah (Ctrl+U)' },
    { type: 'divider' },
    { icon: List,      cmd: 'insertUnorderedList', title: 'Daftar bullet' },
    { icon: ListOrdered, cmd: 'insertOrderedList',  title: 'Daftar nomor' },
    { type: 'divider' },
    { icon: Indent,         cmd: 'indent',  title: 'Indent (Tab)' },
    { icon: IndentDecrease, cmd: 'outdent', title: 'Outdent (Shift+Tab)' },
    { type: 'divider' },
    { type: 'heading' },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-[200px] border-t border-border/40">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-5 py-2 bg-muted/30 border-b border-border/40 flex-wrap">
        {toolbar.map((item, i) => {
          if (item.type === 'divider') {
            return <div key={i} className="w-px h-5 bg-border/60 mx-1" />;
          }
          if (item.type === 'heading') {
            return (
              <div key={i} className="relative" ref={headingRef}>
                <button
                  type="button"
                  title="Heading"
                  onMouseDown={e => { e.preventDefault(); setShowHeading(v => !v); }}
                  className="p-1.5 rounded hover:bg-border/60 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Heading1 size={16} />
                </button>
                {showHeading && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowHeading(false)} />
                    <div className="absolute top-full left-0 mt-1 z-20 bg-card border border-border shadow-xl rounded-lg overflow-hidden min-w-[100px]">
                      {[
                        { label: 'Heading 1', tag: 'h1' },
                        { label: 'Heading 2', tag: 'h2' },
                        { label: 'Heading 3', tag: 'h3' },
                        { label: 'Heading 4', tag: 'h4' },
                        { label: 'Heading 5', tag: 'h5' },
                      ].map(h => (
                        <button
                          key={h.tag}
                          type="button"
                          onMouseDown={e => { e.preventDefault(); exec('formatBlock', h.tag); setShowHeading(false); }}
                          className="block w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                        >
                          {h.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          }
          const Icon = item.icon;
          return (
            <button
              key={i}
              type="button"
              title={item.title}
              onMouseDown={e => { e.preventDefault(); exec(item.cmd, item.arg); }}
              className="p-1.5 rounded hover:bg-border/60 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Icon size={16} />
            </button>
          );
        })}
        {/* Info hint */}
        <span className="ml-auto text-[10px] text-muted-foreground/50 hidden sm:inline">
          HTML
        </span>
      </div>

      {/* Editor area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        className="flex-1 px-5 py-3 text-sm leading-relaxed focus:outline-none overflow-y-auto min-h-[180px]"
        data-placeholder="Tulis pesan Anda di sini..."
        style={{ '--placeholder': '"Tulis pesan Anda di sini..."' }}
      />
    </div>
  );
}

// ── Sub-component: Suggestion List ────────────────────────────────────────────

function SuggestionList({ items, onSelect }) {
  return (
    <div className="absolute top-full left-16 right-0 bg-card border border-border shadow-lg rounded-lg mt-1 z-20 overflow-hidden max-h-48 overflow-y-auto">
      {items.map((c, i) => {
        const name  = c.name  || c.c_cn  || (Array.isArray(c) ? c[1] : '') || '';
        const email = c.email || c.c_mail || (Array.isArray(c) ? c[2] : '') || '';
        return (
          <button
            key={i}
            type="button"
            onMouseDown={e => { e.preventDefault(); onSelect(c); }}
            className="w-full text-left px-3 py-2 text-sm hover:bg-muted focus:bg-muted focus:outline-none"
          >
            <div className="font-medium text-foreground">{name || email}</div>
            {name && <div className="text-xs text-muted-foreground">{email}</div>}
          </button>
        );
      })}
    </div>
  );
}
