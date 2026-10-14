import React, { useState, useMemo, useId } from 'react';
import { Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import {
  FIELD_OPTIONS, MATCH_OPTIONS, ACTION_OPTIONS, operatorsFor, fieldKind,
  emptyCondition, validateRule, describeRule,
} from '../../lib/sieveFilters';
import Modal from './Modal';
import { inputCls, iconBtn, btnPrimary, btnGhost } from './styles';

// ─── Folder picker ───────────────────────────────────────────────────────────
export function FolderSelect({ value, onChange, folders, id, label }) {
  const known = folders.some((f) => f.path === value);
  return (
    <select id={id} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} flex-1`}>
      <option value="">— Pilih folder —</option>
      {!known && value && <option value={value}>{value} (tidak ditemukan)</option>}
      {folders.map((f) => (
        <option key={f.path} value={f.path}>{' '.repeat((f.depth || 0) * 2)}{f.label}</option>
      ))}
    </select>
  );
}

/**
 * Editor aturan server (Sieve) — dipakai halaman Aturan DAN "Buat aturan dari
 * pesan ini" (QuickRuleModal), supaya fitur & tampilannya sama.
 *
 * Props tambahan (opsional):
 *  - title       : judul modal (default: "Aturan baru" / "Edit aturan: …")
 *  - renderTop   : (rule, setRule) => node — di atas form (mis. kondisi cepat)
 *  - note        : node — catatan kecil di bawah pratinjau
 *  - footerStart : (rule) => node — kiri footer (mis. "Opsi lanjutan…")
 */
export default function RuleEditor({ initial, folders, folderLabel, onCancel, onSave, saving, title, renderTop, note, footerStart }) {
  const [rule, setRule] = useState(() => JSON.parse(JSON.stringify(initial)));
  const [showErrors, setShowErrors] = useState(false);
  const errors = useMemo(() => validateRule(rule), [rule]);
  const nameId = useId();
  const set = (patch) => setRule((r) => ({ ...r, ...patch }));
  const setCond = (i, patch) => set({ conditions: rule.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const setAct = (i, patch) => set({ actions: rule.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const hasDiscard = rule.actions.some((a) => a.type === 'discard');

  const submit = (e) => {
    e.preventDefault();
    if (errors.length) { setShowErrors(true); return; }
    onSave(rule);
  };

  return (
    <Modal
      title={title || (initial.name ? `Edit aturan: ${initial.name}` : 'Aturan baru')}
      onClose={onCancel}
      size="max-w-2xl"
      footerStart={footerStart ? footerStart(rule) : null}
      footer={(
        <>
          <button type="button" onClick={onCancel} className={btnGhost}>Batal</button>
          <button type="submit" form="rule-editor-form" disabled={saving} className={btnPrimary}>
            {saving && <Loader2 size={14} className="animate-spin" />} Simpan ke server
          </button>
        </>
      )}
    >
      {renderTop && <div className="mb-5">{renderTop(rule, setRule)}</div>}
      <form id="rule-editor-form" onSubmit={submit} className="space-y-5" noValidate>
        <div>
          <label htmlFor={nameId} className="block text-xs font-medium text-muted-foreground mb-1.5">Nama aturan</label>
          <input id={nameId} type="text" value={rule.name} onChange={(e) => set({ name: e.target.value })}
            placeholder="Misal: Proyek dari Bayu" className={`${inputCls} w-full`} maxLength={120} />
        </div>

        {/* Jika */}
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-foreground mb-1.5">Jika</legend>
          <div role="radiogroup" aria-label="Cara pencocokan" className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
            {MATCH_OPTIONS.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={rule.match === m.id}
                onClick={() => set({ match: m.id })}
                className={`h-11 sm:h-9 px-3 rounded-md text-xs font-medium transition-colors ${rule.match === m.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                {m.label}
              </button>
            ))}
          </div>
          {rule.match !== 'allmessages' && (
            <div className="space-y-2">
              {rule.conditions.map((c, i) => (
                <div key={i} className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg border border-border bg-background/50">
                  <select aria-label={`Kolom kondisi ${i + 1}`} value={c.field}
                    onChange={(e) => {
                      const field = e.target.value;
                      const kindChanged = fieldKind(field) !== fieldKind(c.field) && (fieldKind(field) === 'size' || fieldKind(c.field) === 'size');
                      setCond(i, kindChanged ? { ...emptyCondition(field) } : { field });
                    }}
                    className={inputCls}>
                    {FIELD_OPTIONS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                  {c.field === 'header' && (
                    <input aria-label={`Nama header kondisi ${i + 1}`} value={c.header} onChange={(e) => setCond(i, { header: e.target.value })}
                      placeholder="List-Id" className={`${inputCls} w-28`} />
                  )}
                  <select aria-label={`Operator kondisi ${i + 1}`} value={c.operator} onChange={(e) => setCond(i, { operator: e.target.value })} className={inputCls}>
                    {operatorsFor(c.field).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                  {c.field === 'size' ? (
                    <span className="flex items-center gap-1.5 flex-1 min-w-[140px]">
                      <input aria-label={`Ukuran kondisi ${i + 1}`} type="number" min="1" inputMode="numeric" value={c.value}
                        onChange={(e) => setCond(i, { value: e.target.value })} className={`${inputCls} flex-1 w-20`} />
                      <select aria-label={`Satuan ukuran kondisi ${i + 1}`} value={c.unit} onChange={(e) => setCond(i, { unit: e.target.value })} className={inputCls}>
                        <option value="KB">KB</option><option value="MB">MB</option>
                      </select>
                    </span>
                  ) : (
                    <input aria-label={`Nilai kondisi ${i + 1}`} value={c.value} onChange={(e) => setCond(i, { value: e.target.value })}
                      placeholder={fieldKind(c.field) === 'address' ? 'nama@domain.com atau bagian alamat' : 'teks…'}
                      className={`${inputCls} flex-1 min-w-[140px]`} />
                  )}
                  <button type="button" aria-label={`Hapus kondisi ${i + 1}`} disabled={rule.conditions.length <= 1}
                    onClick={() => set({ conditions: rule.conditions.filter((_, j) => j !== i) })}
                    className={`${iconBtn} hover:text-destructive`}><Trash2 size={14} /></button>
                </div>
              ))}
              <button type="button" onClick={() => set({ conditions: [...rule.conditions, emptyCondition('from')] })}
                className="inline-flex items-center gap-1.5 h-11 sm:h-8 text-xs font-medium text-primary hover:underline">
                <Plus size={14} /> Tambah kondisi
              </button>
              <p className="text-[11px] text-muted-foreground">
                Kolom alamat (Dari/Kepada/Cc) dicocokkan dengan alamat email, bukan nama tampilan. Pola: <code>*</code> = teks apa pun, <code>?</code> = satu karakter.
              </p>
            </div>
          )}
        </fieldset>

        {/* Lakukan */}
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-foreground mb-1.5">Lakukan</legend>
          {rule.actions.map((a, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg border border-border bg-background/50">
              {a.type === 'other' ? (
                <span className="flex-1 text-xs text-muted-foreground">Tindakan dari klien lain: <code>{a.raw?.method}</code> {a.argument} (dipertahankan)</span>
              ) : (
                <select aria-label={`Jenis tindakan ${i + 1}`} value={a.type} onChange={(e) => setAct(i, { type: e.target.value, argument: '' })} className={inputCls}>
                  {ACTION_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              )}
              {a.type === 'fileinto' && (
                <FolderSelect label={`Folder tujuan tindakan ${i + 1}`} value={a.argument} onChange={(v) => setAct(i, { argument: v })} folders={folders} />
              )}
              {a.type === 'redirect' && (
                <input aria-label={`Alamat penerusan tindakan ${i + 1}`} type="email" value={a.argument} onChange={(e) => setAct(i, { argument: e.target.value })}
                  placeholder="nama@domain.com" className={`${inputCls} flex-1 min-w-[160px]`} />
              )}
              <button type="button" aria-label={`Hapus tindakan ${i + 1}`} onClick={() => set({ actions: rule.actions.filter((_, j) => j !== i) })}
                className={`${iconBtn} hover:text-destructive`}><Trash2 size={14} /></button>
            </div>
          ))}
          {hasDiscard && (
            <p role="alert" className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              Email yang cocok akan DIBUANG permanen di server — tidak masuk Sampah dan tidak bisa dipulihkan.
            </p>
          )}
          <button type="button" onClick={() => set({ actions: [...rule.actions, { type: 'mark_seen', argument: '' }] })}
            className="inline-flex items-center gap-1.5 h-11 sm:h-8 text-xs font-medium text-primary hover:underline">
            <Plus size={14} /> Tambah tindakan
          </button>
          <label className="flex items-center gap-2 min-h-11 sm:min-h-8 text-sm text-foreground cursor-pointer">
            <input type="checkbox" checked={rule.stop} onChange={(e) => set({ stop: e.target.checked })} className="w-4 h-4 accent-primary" />
            Berhenti memproses aturan lain
          </label>
        </fieldset>

        <div className="rounded-lg bg-muted px-3 py-2.5" aria-live="polite">
          <div className="text-[11px] font-medium text-muted-foreground mb-0.5">Pratinjau</div>
          <p className="text-sm text-foreground break-words">{describeRule(rule, folderLabel)}</p>
        </div>
        {note && <p className="text-[11px] text-muted-foreground">{note}</p>}

        {showErrors && errors.length > 0 && (
          <ul role="alert" className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md space-y-0.5 list-disc pl-6">
            {errors.map((er) => <li key={er}>{er}</li>)}
          </ul>
        )}
      </form>
    </Modal>
  );
}
