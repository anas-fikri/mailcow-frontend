/**
 * Auto-Archive Rules Engine
 * — Menyimpan aturan archive di localStorage
 * — Match kondisi message terhadap rule
 * — Eksekusi move otomatis ke folder target
 */

// ─── Rule Shape ───────────────────────────────────────────────────────────────
// Rule: {
//   id: string,
//   name: string,
//   enabled: boolean,
//   conditions: Array<{ field, operator, value }>,
//   matchType: 'all' | 'any',   // AND / OR
//   actionFolder: string,        // folderId tujuan
//   createdAt: number,
//   runCount: number,            // berapa kali rule ini sukses
//   lastRunAt: number | null,
// }

// ─── Available fields & operators ─────────────────────────────────────────────
export const RULE_FIELDS = [
  { id: 'from',    label: 'Pengirim (From)' },
  { id: 'to',      label: 'Penerima (To)' },
  { id: 'subject', label: 'Subjek' },
  // Bug fix: body dihapus dari available fields — SOGo list view TIDAK mengembalikan
  // field body (hanya from/to/subject/date/isRead/hasAtt). Rule berbasis body tidak
  // akan pernah match dari list view. Kalau mau filter body, pakai server-side filter.
];

export const RULE_OPS = [
  { id: 'contains',    label: 'Mengandung' },
  { id: 'equals',      label: 'Sama dengan' },
  { id: 'startsWith',  label: 'Dimulai dengan' },
  { id: 'endsWith',    label: 'Diakhiri dengan' },
  { id: 'notContains', label: 'Tidak mengandung' },
];

export const RULE_MATCH_TYPES = [
  { id: 'all', label: 'Semua kondisi (AND)' },
  { id: 'any', label: 'Salah satu kondisi (OR)' },
];

// ─── localStorage key ─────────────────────────────────────────────────────────
function lsKey(email) {
  return `auto_archive_rules_${email}`;
}

// ─── Read / Write ─────────────────────────────────────────────────────────────

/**
 * Ambil semua rules untuk user, TER-NORMALISASI.
 *
 * Data lama/rusak di localStorage (non-array, rule tanpa id, conditions bukan
 * array, value bukan string, dll) dinormalkan di sini — pola yang sama dengan
 * loadSignatures — sehingga RulesPage (render) dan matchRules/executeRules
 * (engine) selalu menerima bentuk rule yang valid. Sebelumnya JSON.parse
 * mentah: rules.map pada non-array atau `c.value.trim()` pada value non-string
 * bisa melempar TypeError dan mematikan halaman/engine.
 */
export function getRules(email) {
  if (!email) return [];
  try {
    const raw = localStorage.getItem(lsKey(email));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r) => r && typeof r === 'object' && typeof r.id === 'string')
      .map((r) => ({
        id: r.id,
        name: typeof r.name === 'string' && r.name ? r.name : 'Aturan Baru',
        // Default enabled=true (nilai lama tanpa field dianggap aktif).
        enabled: r.enabled !== false,
        conditions: (Array.isArray(r.conditions) ? r.conditions : [])
          .filter((c) => c && typeof c === 'object' && typeof c.field === 'string')
          .map((c) => ({
            field: c.field,
            operator: typeof c.operator === 'string' ? c.operator : 'contains',
            value: typeof c.value === 'string' ? c.value : String(c.value ?? ''),
          })),
        matchType: r.matchType === 'any' ? 'any' : 'all',
        actionFolder: typeof r.actionFolder === 'string' ? r.actionFolder : '',
        createdAt: Number(r.createdAt) || 0,
        runCount: Number(r.runCount) || 0,
        lastRunAt: Number(r.lastRunAt) || null,
      }));
  } catch {
    return [];
  }
}

/** Simpan rules */
function saveRules(email, rules) {
  if (!email) return;
  try {
    localStorage.setItem(lsKey(email), JSON.stringify(rules));
  } catch { /* quota exceeded — silent */ }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function addRule(email, rule) {
  if (!email) throw new Error('Email pengguna tidak tersedia — silakan login ulang.');
  const rules = getRules(email);
  const newRule = {
    id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: rule.name || 'Aturan Baru',
    enabled: true,
    conditions: rule.conditions || [{ field: 'from', operator: 'contains', value: '' }],
    matchType: rule.matchType || 'all',
    actionFolder: rule.actionFolder || 'folderTrash',
    createdAt: Date.now(),
    runCount: 0,
    lastRunAt: null,
  };
  rules.push(newRule);
  saveRules(email, rules);
  return newRule;
}

export function updateRule(email, ruleId, updates) {
  const rules = getRules(email);
  const idx = rules.findIndex((r) => r.id === ruleId);
  if (idx === -1) return null;
  rules[idx] = { ...rules[idx], ...updates };
  saveRules(email, rules);
  return rules[idx];
}

export function deleteRule(email, ruleId) {
  const rules = getRules(email);
  const filtered = rules.filter((r) => r.id !== ruleId);
  saveRules(email, filtered);
}

export function toggleRule(email, ruleId) {
  const rules = getRules(email);
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) return null;
  rule.enabled = !rule.enabled;
  saveRules(email, rules);
  return rule;
}

// ─── Matching Engine ──────────────────────────────────────────────────────────

/** Cek apakah satu kondisi match */
function checkCondition(condition, message) {
  const { field, operator, value } = condition;
  if (!value || !value.trim()) return true; // empty condition = lulus

  // Ambil nilai dari message
  let target = '';
  switch (field) {
    case 'from':    target = message.from || ''; break;
    case 'to':      target = message.to || ''; break;
    case 'subject': target = message.subject || ''; break;
    case 'body':    target = message.body || ''; break;
    default: return false;
  }

  const lowerTarget = target.toLowerCase();
  const lowerValue = value.toLowerCase().trim();

  switch (operator) {
    case 'contains':    return lowerTarget.includes(lowerValue);
    case 'equals':      return lowerTarget === lowerValue;
    case 'startsWith':  return lowerTarget.startsWith(lowerValue);
    case 'endsWith':    return lowerTarget.endsWith(lowerValue);
    case 'notContains': return !lowerTarget.includes(lowerValue);
    default: return false;
  }
}

/**
 * Cek apakah satu message match terhadap semua rules yang enabled.
 * Returns array of matched rule IDs (bisa kosong).
 */
export function matchRules(email, message) {
  const rules = getRules(email);
  const matched = [];

  for (const rule of rules) {
    if (!rule.enabled || !rule.conditions.length) continue;

    // Filter conditions yang punya value
    const validConditions = rule.conditions.filter((c) => c.value && c.value.trim());

    if (validConditions.length === 0) continue;

    const results = validConditions.map((c) => checkCondition(c, message));

    const isMatch = rule.matchType === 'all'
      ? results.every(Boolean)  // AND: semua kondisi harus match
      : results.some(Boolean);  // OR: minimal satu kondisi match

    if (isMatch) matched.push(rule.id);
  }

  return matched;
}

/**
 * Eksekusi rules: pindahkan message yang match ke folder tujuan.
 * Hanya berfungsi jika message punya uid (sudah dimuat dari server).
 *
 * @param {string}  email
 * @param {string}  sogoToken
 * @param {string}  sourceFolder  folder asal message
 * @param {Array}   messages      daftar message (dari server)
 * @param {function} moveFn       fungsi untuk move messages: (uids, targetFolder) => Promise
 * @returns {Promise<Array>}      daftar { ruleId, ruleName, uids, targetFolder }
 */
export async function executeRules(email, sogoToken, sourceFolder, messages, moveFn) {
  const rules = getRules(email);
  const actions = [];

  // Pre-compute per-message matched rule IDs to avoid redundant matchRules() calls
  const msgMatches = new Map();
  for (const msg of messages) {
    msgMatches.set(msg.uid, matchRules(email, msg));
  }

  for (const rule of rules) {
    if (!rule.enabled || !rule.conditions.length) continue;

    const matchedUids = [];
    for (const msg of messages) {
      if (msgMatches.get(msg.uid)?.includes(rule.id)) {
        matchedUids.push(msg.uid);
      }
    }

    if (matchedUids.length > 0 && rule.actionFolder !== sourceFolder) {
      try {
        await moveFn(matchedUids, rule.actionFolder);
        actions.push({
          ruleId: rule.id,
          ruleName: rule.name,
          uids: matchedUids,
          targetFolder: rule.actionFolder,
        });

        // Update run count
        updateRule(email, rule.id, {
          runCount: rule.runCount + 1,
          lastRunAt: Date.now(),
        });
      } catch (e) {
        console.warn(`[AutoArchive] Rule "${rule.name}" gagal:`, e);
      }
    }
  }

  return actions;
}

// ─── Summary ──────────────────────────────────────────────────────────────────

/** Dapatkan ringkasan rule untuk dashboard */
export function getRuleSummary(email) {
  const rules = getRules(email);
  return {
    total: rules.length,
    enabled: rules.filter((r) => r.enabled).length,
    totalRuns: rules.reduce((sum, r) => sum + (r.runCount || 0), 0),
  };
}

// ─── Test Rule ───────────────────────────────────────────────────────────────

/**
 * Test satu rule terhadap sample message.
 * Returns detailed result per condition + overall match.
 * 
 * @param {object} rule       — rule object
 * @param {object} sampleMsg  — { from, to, subject, body }
 * @returns {{ match: boolean, results: Array<{condition, passed, targetValue}> }}
 */
export function testRuleAgainstMessage(rule, sampleMsg) {
  if (!rule?.conditions?.length) {
    return { match: false, results: [] };
  }

  const validConditions = rule.conditions.filter((c) => c.value && c.value.trim());
  if (validConditions.length === 0) {
    return { match: false, results: [] };
  }

  // Mapping field ke properti di sample message
  const fieldToProp = { from: 'from', to: 'to', subject: 'subject', body: 'body' };

  const results = validConditions.map((condition) => {
    const targetValue = sampleMsg[fieldToProp[condition.field]] || '';
    const passed = checkCondition(condition, {
      from: sampleMsg.from,
      to: sampleMsg.to,
      subject: sampleMsg.subject,
      body: sampleMsg.body,
    });
    return { condition, passed, targetValue };
  });

  const match = rule.matchType === 'all'
    ? results.every((r) => r.passed)
    : results.some((r) => r.passed);

  return { match, results };
}

// ─── Reset ────────────────────────────────────────────────────────────────────

export function clearAllRules(email) {
  if (!email) return;
  localStorage.removeItem(lsKey(email));
}
