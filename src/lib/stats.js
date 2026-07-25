/**
 * Stats API — Mail statistics untuk dashboard.
 * Data sementara pakai mock, nanti bisa diganti dengan hitungan real dari SOGo.
 */

const MOCK_STATS = {
  // Ringkasan 7 hari terakhir
  summary: {
    sent: 142,
    received: 385,
    bounced: 8,
    rejected: 52,
    spamCaught: 34,
    virusBlocked: 2,
  },
  // Tren harian 7 hari
  daily: [
    { date: 'Sen', sent: 18, received: 52, bounced: 1, spam: 5 },
    { date: 'Sel', sent: 24, received: 61, bounced: 2, spam: 7 },
    { date: 'Rab', sent: 32, received: 73, bounced: 0, spam: 4 },
    { date: 'Kam', sent: 28, received: 58, bounced: 2, spam: 6 },
    { date: 'Jum', sent: 21, received: 64, bounced: 1, spam: 5 },
    { date: 'Sab', sent: 12, received: 45, bounced: 1, spam: 3 },
    { date: 'Min', sent: 7, received: 32, bounced: 1, spam: 4 },
  ],
  // Distribusi storage
  storage: {
    used: 107, // GB
    total: 546,
    mailboxes: 77,
    domains: 2,
  },
  // Perbandingan periode
  comparison: {
    sentChange: '+12%',
    receivedChange: '+8%',
    spamChange: '-5%',
  },
};

let statsCache = { ...MOCK_STATS };

/** Reset ke data awal */
export function resetMockStats() {
  statsCache = { ...MOCK_STATS };
}

/** Update mock data (untuk testing variasi) */
export function updateMockStats(overrides) {
  statsCache = {
    ...statsCache,
    ...overrides,
  };
}

/** Fetch ringkasan statistik */
export async function fetchStatsSummary() {
  // Simulasi network delay
  await new Promise((r) => setTimeout(r, 400));
  return { ...statsCache.summary };
}

/** Fetch tren harian */
export async function fetchDailyTrend() {
  await new Promise((r) => setTimeout(r, 300));
  return statsCache.daily.map((d) => ({ ...d }));
}

/** Fetch info storage */
export async function fetchStorageInfo() {
  await new Promise((r) => setTimeout(r, 200));
  return { ...statsCache.storage };
}

/** Fetch perbandingan periode */
export async function fetchComparison() {
  await new Promise((r) => setTimeout(r, 200));
  return { ...statsCache.comparison };
}

/** Fetch semua data statistik sekaligus */
export async function fetchAllStats() {
  const [summary, daily, storage, comparison] = await Promise.all([
    fetchStatsSummary(),
    fetchDailyTrend(),
    fetchStorageInfo(),
    fetchComparison(),
  ]);
  return { summary, daily, storage, comparison };
}
