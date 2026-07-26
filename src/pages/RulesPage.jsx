import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Plus, Trash2, ToggleLeft, ToggleRight, Folder, Filter,
  ChevronDown, ChevronUp, AlertCircle, RefreshCw, Play,
  CheckCircle2, XCircle, HelpCircle, AlertTriangle,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { fetchFolders, moveMessages } from '../lib/api';
import { toast } from '../lib/toast';
import {
  getRules, addRule, updateRule, deleteRule, toggleRule,
  RULE_FIELDS, RULE_OPS, RULE_MATCH_TYPES, executeRules,
  testRuleAgainstMessage,
} from '../lib/autoArchive';
import { DEFAULT_FOLDERS, STALE_TIMES } from '../lib/constants';

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground gap-4 px-6">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
        <Filter size={24} className="opacity-40" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium">Belum ada aturan archive</p>
        <p className="text-xs mt-1 max-w-xs">
          Buat aturan untuk otomatis memindahkan email ke folder tertentu
          berdasarkan pengirim, subjek, atau kriteria lainnya.
        </p>
      </div>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-colors"
      >
        <Plus size={16} />
        Buat Aturan
      </button>
    </div>
  );
}

// ─── Condition Row ────────────────────────────────────────────────────────────
function ConditionRow({ condition, fields, ops, onChange, onRemove, canRemove }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={condition.field}
        onChange={(e) => onChange({ ...condition, field: e.target.value })}
        className="bg-muted border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      >
        {fields.map((f) => (
          <option key={f.id} value={f.id}>{f.label}</option>
        ))}
      </select>

      <select
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value })}
        className="bg-muted border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      >
        {ops.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>

      <input
        type="text"
        value={condition.value}
        onChange={(e) => onChange({ ...condition, value: e.target.value })}
        placeholder="Nilai..."
        className="flex-1 min-w-[120px] bg-muted border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary"
      />

      {canRemove && (
        <button
          onClick={onRemove}
          className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/10 transition-colors"
          title="Hapus kondisi"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

// ─── Rule Card ────────────────────────────────────────────────────────────────
function RuleCard({ rule, allFolders, onToggle, onEdit, onDelete, onTest }) {
  const [expanded, setExpanded] = useState(false);

  const getConditionSummary = (conditions) => {
    if (!conditions?.length) return 'Tidak ada kondisi';
    return conditions
      .filter((c) => c.value)
      .map((c) => {
        const fieldLabel = RULE_FIELDS.find((f) => f.id === c.field)?.label || c.field;
        const opLabel = RULE_OPS.find((o) => o.id === c.operator)?.label || c.operator;
        return `${fieldLabel} ${opLabel} "${c.value}"`;
      })
      .join(rule.matchType === 'all' ? ' DAN ' : ' ATAU ') || 'Tidak ada kondisi';
  };

  const targetFolderLabel =
    allFolders.find((f) => f.id === rule.actionFolder)?.label || rule.actionFolder;

  return (
    <div className={`bg-card border ${rule.enabled ? 'border-border' : 'border-dashed border-muted'} rounded-xl overflow-hidden transition-all`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={() => onToggle(rule.id)}
            className={`shrink-0 transition-colors ${rule.enabled ? 'text-primary' : 'text-muted-foreground'}`}
            title={rule.enabled ? 'Nonaktifkan' : 'Aktifkan'}
          >
            {rule.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium truncate ${rule.enabled ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                {rule.name}
              </span>
              {rule.runCount > 0 && (
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
                  {rule.runCount}x
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <Folder size={12} className="shrink-0" />
              <span className="truncate">{'\u2192 '}{targetFolderLabel}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Detail"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button
            onClick={() => onTest(rule)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-green-500 hover:bg-green-500/10 transition-colors"
            title="Test Aturan"
          >
            <Play size={15} />
          </button>
          <button
            onClick={() => onEdit(rule)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Edit"
          >
            <Filter size={15} />
          </button>
          <button
            onClick={() => onDelete(rule.id)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Hapus"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Expanded: kondisi */}
      {expanded && (
        <div className="px-4 pb-3 pt-0 border-t border-border">
          <div className="mt-2 space-y-1">
            {rule.conditions
              .filter((c) => c.value)
              .map((c, i) => {
                const fieldLabel = RULE_FIELDS.find((f) => f.id === c.field)?.label || c.field;
                const opLabel = RULE_OPS.find((o) => o.id === c.operator)?.label || c.operator;
                return (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                    <span>{fieldLabel}</span>
                    <span className="font-medium text-foreground/70">{opLabel}</span>
                    <span className="text-foreground">"{c.value}"</span>
                    {i < rule.conditions.length - 1 && (
                      <span className="text-[10px] uppercase font-bold text-primary/60 ml-auto">
                        {rule.matchType === 'all' ? 'DAN' : 'ATAU'}
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground">
            Terakhir dijalankan: {rule.lastRunAt ? new Date(rule.lastRunAt).toLocaleString('id-ID') : 'Belum pernah'}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Rule Form Modal ──────────────────────────────────────────────────────────
function RuleFormModal({ isOpen, onClose, onSave, allFolders, editRule }) {
  const [name, setName] = useState(editRule?.name || '');
  const [conditions, setConditions] = useState(
    editRule?.conditions?.length
      ? editRule.conditions.map((c) => ({ ...c }))
      : [{ field: 'from', operator: 'contains', value: '' }]
  );
  const [matchType, setMatchType] = useState(editRule?.matchType || 'all');
  const [actionFolder, setActionFolder] = useState(editRule?.actionFolder || 'folderTrash');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleAddCondition = () => {
    setConditions([...conditions, { field: 'from', operator: 'contains', value: '' }]);
  };

  const handleChangeCondition = (idx, newCond) => {
    const updated = conditions.map((c, i) => (i === idx ? newCond : c));
    setConditions(updated);
  };

  const handleRemoveCondition = (idx) => {
    setConditions(conditions.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Nama aturan wajib diisi.');
      return;
    }
    const validConds = conditions.filter((c) => c.value && c.value.trim());
    if (validConds.length === 0) {
      setError('Minimal satu kondisi harus diisi.');
      return;
    }
    onSave({
      name: name.trim(),
      conditions: validConds,
      matchType,
      actionFolder,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto z-10">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-base font-semibold text-foreground">
            {editRule ? 'Edit Aturan' : 'Buat Aturan Baru'}
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Nama */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nama Aturan</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Misal: Arsip dari Bank"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
          </div>

          {/* Conditions */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-muted-foreground">Kondisi</label>
              <button
                type="button"
                onClick={handleAddCondition}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Plus size={12} />
                Tambah Kondisi
              </button>
            </div>
            <div className="space-y-2">
              {conditions.map((cond, idx) => (
                <ConditionRow
                  key={idx}
                  condition={cond}
                  fields={RULE_FIELDS}
                  ops={RULE_OPS}
                  onChange={(newCond) => handleChangeCondition(idx, newCond)}
                  onRemove={() => handleRemoveCondition(idx)}
                  canRemove={conditions.length > 1}
                />
              ))}
            </div>
          </div>

          {/* Match type */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Pencocokan</label>
            <div className="flex gap-2">
              {RULE_MATCH_TYPES.map((mt) => (
                <button
                  key={mt.id}
                  type="button"
                  onClick={() => setMatchType(mt.id)}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    matchType === mt.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {mt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Target folder */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Pindahkan ke Folder</label>
            <select
              value={actionFolder}
              onChange={(e) => setActionFolder(e.target.value)}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {allFolders.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-lg transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-colors"
            >
              {editRule ? 'Simpan' : 'Buat Aturan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Test Rule Modal ────────────────────────────────────────────────────────
function TestRuleModal({ isOpen, onClose, rule }) {
  const [sample, setSample] = useState({ from: '', to: '', subject: '', body: '' });
  const [result, setResult] = useState(null);

  if (!isOpen || !rule) return null;

  const handleTest = (e) => {
    e.preventDefault();
    const res = testRuleAgainstMessage(rule, sample);
    setResult(res);
  };

  const handleChange = (field) => (e) => {
    setSample((prev) => ({ ...prev, [field]: e.target.value }));
    setResult(null);
  };

  const getOperatorLabel = (op) => RULE_OPS.find((o) => o.id === op)?.label || op;
  const getFieldLabel = (f) => RULE_FIELDS.find((field) => field.id === f)?.label || f;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] px-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto z-10">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <HelpCircle size={18} className="text-primary" />
            Test Aturan: {rule.name}
          </h3>
        </div>

        <div className="p-5 space-y-4">
          {/* Conditions summary */}
          <div className="bg-muted rounded-xl p-3 text-xs space-y-1.5">
            <div className="font-medium text-muted-foreground mb-1">Kondisi ({rule.matchType === 'all' ? 'AND' : 'OR'}):</div>
            {rule.conditions.filter((c) => c.value).map((c, i) => (
              <div key={i} className="flex items-center gap-1.5 text-muted-foreground">
                <span className="w-1 h-1 rounded-full bg-primary/40" />
                <span>{getFieldLabel(c.field)}</span>
                <span className="font-medium text-foreground/70">{getOperatorLabel(c.operator)}</span>
                <span className="text-foreground">"{c.value}"</span>
              </div>
            ))}
          </div>

          {/* Sample form */}
          <form onSubmit={handleTest} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Dari (From)</label>
              <input
                type="text"
                value={sample.from}
                onChange={handleChange('from')}
                placeholder="misal: bank@gmail.com"
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Kepada (To)</label>
              <input
                type="text"
                value={sample.to}
                onChange={handleChange('to')}
                placeholder="misal: saya@company.com"
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Subjek</label>
              <input
                type="text"
                value={sample.subject}
                onChange={handleChange('subject')}
                placeholder="misal: Invoice Bulanan"
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Isi Email (Body)</label>
              <textarea
                value={sample.body}
                onChange={handleChange('body')}
                placeholder="misal: Lampiran tagihan bulan ini..."
                rows={3}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-colors"
            >
              <Play size={16} />
              Uji Aturan
            </button>
          </form>

          {/* Result */}
          {result && (
            <div className={`rounded-xl p-4 space-y-3 ${result.match ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
              {/* Overall */}
              <div className="flex items-center gap-2">
                {result.match ? (
                  <>
                    <CheckCircle2 size={20} className="text-green-500" />
                    <span className="text-sm font-semibold text-green-600 dark:text-green-400">MATCH — Email akan dipindahkan!</span>
                  </>
                ) : (
                  <>
                    <XCircle size={20} className="text-red-500" />
                    <span className="text-sm font-semibold text-red-600 dark:text-red-400">TIDAK MATCH — Email tidak akan dipindahkan</span>
                  </>
                )}
              </div>

              {/* Per-condition details */}
              <div className="space-y-1.5">
                {result.results.map((r, i) => {
                  const cond = r.condition;
                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-2 text-xs p-2 rounded-lg ${
                        r.passed ? 'bg-green-500/10' : 'bg-red-500/10'
                      }`}
                    >
                      {r.passed ? (
                        <CheckCircle2 size={14} className="text-green-500 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                      )}
                      <div>
                        <span className="font-medium text-foreground">
                          {getFieldLabel(cond.field)} {getOperatorLabel(cond.operator)} "{cond.value}"
                        </span>
                        <div className="text-muted-foreground mt-0.5">
                          Nilai dari input: "{r.targetValue || '(kosong)'}"
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => { onClose(); setResult(null); setSample({ from: '', to: '', subject: '', body: '' }); }}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-lg transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────
function StatsBar({ rules }) {
  const total = rules.length;
  const enabled = rules.filter((r) => r.enabled).length;
  const totalRuns = rules.reduce((sum, r) => sum + (r.runCount || 0), 0);

  if (total === 0) return null;

  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
      <span>{total} aturan</span>
      <span className="w-1 h-1 rounded-full bg-border" />
      <span>{enabled} aktif</span>
      <span className="w-1 h-1 rounded-full bg-border" />
      <span>{totalRuns}x dijalankan</span>
    </div>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────
function DeleteConfirmModal({ isOpen, onClose, onConfirm, ruleName }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm z-10 p-6 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
          <AlertTriangle size={24} className="text-destructive" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-2">Hapus Aturan?</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Aturan <strong className="text-foreground">"{ruleName || ''}"</strong> akan dihapus permanen.
          Tindakan ini tidak dapat dibatalkan.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 rounded-xl transition-colors"
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-destructive-foreground bg-destructive hover:bg-destructive/90 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <Trash2 size={16} />
            Hapus
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RulesPage() {
  const { user } = useAuthStore();
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [testRule, setTestRule] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name }

  // Ambil daftar folders untuk dropdown
  const { data: folders = DEFAULT_FOLDERS } = useQuery({
    queryKey: ['folders', user?.sogoToken],
    queryFn: () => fetchFolders(user?.sogoToken),
    enabled: !!user?.sogoToken,
    staleTime: STALE_TIMES.FOLDERS,
  });

  const allFolders = [
    ...DEFAULT_FOLDERS.filter(
      (df) => !folders.some((f) => f.id === df.id)
    ),
    ...folders,
  ];

  // Rules dari localStorage (re-render dengan forceUpdate via key)
  const [refreshKey, setRefreshKey] = useState(0);
  const rules = getRules(user?.email);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleSave = (data) => {
    if (editingRule) {
      updateRule(user?.email, editingRule.id, data);
      toast.success('Aturan diperbarui');
    } else {
      const newRule = addRule(user?.email, data);
      toast.success(`Aturan "${newRule.name}" dibuat`);
    }
    setShowForm(false);
    setEditingRule(null);
    handleRefresh();
  };

  const handleEdit = (rule) => {
    setEditingRule(rule);
    setShowForm(true);
  };

  const handleToggle = (ruleId) => {
    const rule = toggleRule(user?.email, ruleId);
    if (rule) {
      toast.info(rule.enabled ? 'Aturan diaktifkan' : 'Aturan dinonaktifkan');
      handleRefresh();
    }
  };

  const handleDelete = (ruleId) => {
    const rule = rules.find((r) => r.id === ruleId);
    setDeleteTarget(rule ? { id: rule.id, name: rule.name } : { id: ruleId, name: '' });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteRule(user?.email, deleteTarget.id);
    toast.success(`Aturan "${deleteTarget.name}" dihapus`);
    setDeleteTarget(null);
    handleRefresh();
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Aturan Archive</h1>
            <StatsBar rules={rules} />
          </div>
          <div className="flex items-center gap-2">
            {rules.length > 0 && (
              <button
                onClick={handleRefresh}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Refresh"
              >
                <RefreshCw size={16} />
              </button>
            )}
            <button
              onClick={() => { setEditingRule(null); setShowForm(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-colors"
            >
              <Plus size={16} />
              Aturan Baru
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {rules.length === 0 ? (
          <EmptyState onAdd={() => { setEditingRule(null); setShowForm(true); }} />
        ) : (
          <div className="max-w-2xl mx-auto space-y-2.5">
            {rules.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                allFolders={allFolders}
                onToggle={handleToggle}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onTest={setTestRule}
              />
            ))}
          </div>
        )}
      </div>

      {/* Info banner */}
      {rules.length > 0 && (
        <div className="px-4 py-2.5 bg-muted/50 border-t border-border text-center">
          <p className="text-[11px] text-muted-foreground">
            Aturan akan otomatis dijalankan saat Anda membuka folder yang sesuai.
            Aturan hanya berlaku untuk email baru yang dimuat.
          </p>
        </div>
      )}

      {/* Test Modal */}
      <TestRuleModal
        isOpen={!!testRule}
        onClose={() => setTestRule(null)}
        rule={testRule}
      />

      {/* Delete Confirm Modal */}
      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        ruleName={deleteTarget?.name || ''}
      />

      {/* Form Modal */}
      <RuleFormModal
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditingRule(null); }}
        onSave={handleSave}
        allFolders={allFolders}
        editRule={editingRule}
      />
    </div>
  );
}
