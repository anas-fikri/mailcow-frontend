import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3, Send, Inbox, AlertTriangle, ShieldBan, FileText,
  HardDrive, TrendingUp, RefreshCw, ChevronDown, Activity,
} from 'lucide-react';
import { StatCard, BarChart, DonutChart, ProgressBar } from '../components/Charts';
import { fetchAllStats } from '../lib/stats';

// ─── Warna chart ──────────────────────────────────────────────────────────────
const CHART_COLORS = ['#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#8b5cf6'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatNumber(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function dayName() {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return days[new Date().getDay()];
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function StatsPage() {
  const [period, setPeriod] = useState('7d'); // 7d | 30d

  const { data, isLoading } = useQuery({
    queryKey: ['mail-stats', period],
    queryFn: fetchAllStats,
    staleTime: 5 * 60_000,
  });

  const summary = data?.summary;
  const daily = data?.daily;
  const storage = data?.storage;
  const comparison = data?.comparison;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border bg-card flex items-center justify-between sticky top-0 z-10 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 size={20} className="text-primary" />
          <h1 className="text-lg font-semibold">Statistik Email</h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="bg-muted border-none rounded-lg px-3 py-1.5 text-xs font-medium text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
          >
            <option value="7d">7 Hari</option>
            <option value="30d">30 Hari</option>
          </select>
          <span className="text-xs text-muted-foreground">
            {dayName()}, {new Date().toLocaleDateString('id-ID')}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-5 space-y-6 max-w-5xl mx-auto w-full">
        {/* ── Summary Cards ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Send}
            label="Terkirim"
            value={summary ? formatNumber(summary.sent) : '—'}
            sub={`${summary?.sent || 0} email`}
            trend={comparison?.sentChange}
            color="primary"
            loading={isLoading}
          />
          <StatCard
            icon={Inbox}
            label="Diterima"
            value={summary ? formatNumber(summary.received) : '—'}
            sub={`${summary?.received || 0} email`}
            trend={comparison?.receivedChange}
            color="success"
            loading={isLoading}
          />
          <StatCard
            icon={AlertTriangle}
            label="Bounced"
            value={summary ? formatNumber(summary.bounced) : '—'}
            sub={`${summary?.bounced || 0} gagal kirim`}
            color="warning"
            loading={isLoading}
          />
          <StatCard
            icon={ShieldBan}
            label="Ditolak"
            value={summary ? formatNumber(summary.rejected) : '—'}
            sub={`${summary?.rejected || 0} spam/virus`}
            color="destructive"
            loading={isLoading}
          />
        </div>

        {/* ── Daily Trend Bar Chart ─────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Tren Harian</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Aktivitas email 7 hari terakhir</p>
            </div>
            <Activity size={18} className="text-muted-foreground" />
          </div>
          <BarChart
            data={daily}
            bars={['sent', 'received', 'bounced', 'spam']}
            height={220}
            colors={CHART_COLORS}
            loading={isLoading}
          />
          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-border">
            {[
              { key: 'sent', label: 'Terkirim', color: CHART_COLORS[0] },
              { key: 'received', label: 'Diterima', color: CHART_COLORS[1] },
              { key: 'bounced', label: 'Bounced', color: CHART_COLORS[2] },
              { key: 'spam', label: 'Spam', color: CHART_COLORS[3] },
            ].map((item) => (
              <div key={item.key} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
                {item.label}
              </div>
            ))}
          </div>
        </div>

        {/* ── Bottom Row ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Donut Chart: Spam/Virus Distribution */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Filter Keamanan</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Distribusi spam & virus</p>
              </div>
              <ShieldBan size={18} className="text-muted-foreground" />
            </div>
            <DonutChart
              data={[
                { label: 'Bersih', value: 3120, color: '#22c55e' },
                { label: 'Spam Tag', value: summary?.spamCaught || 540, color: '#f59e0b' },
                { label: 'Spam Tolak', value: summary?.rejected || 180, color: '#ef4444' },
                { label: 'Virus', value: summary?.virusBlocked || 4, color: '#8b5cf6' },
              ]}
              size={160}
              loading={isLoading}
            />
          </div>

          {/* Storage & System Info */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Penyimpanan</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Kapasitas mail server</p>
              </div>
              <HardDrive size={18} className="text-muted-foreground" />
            </div>
            <div className="space-y-4">
              <ProgressBar
                value={storage?.used || 0}
                max={storage?.total || 546}
                label="Storage Mailbox"
                color={storage?.used && storage?.used / storage?.total > 0.8 ? 'warning' : 'primary'}
              />
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="bg-muted/30 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-foreground">{storage?.mailboxes || 0}</div>
                  <div className="text-xs text-muted-foreground">Mailboxes</div>
                </div>
                <div className="bg-muted/30 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-foreground">{storage?.domains || 0}</div>
                  <div className="text-xs text-muted-foreground">Domain</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Quick Stats Row ───────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Ringkasan Cepat</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Dari aktivitas 7 hari terakhir</p>
            </div>
            <FileText size={18} className="text-muted-foreground" />
          </div>
          {isLoading ? (
            <div className="h-20 bg-muted/30 rounded-xl animate-pulse" />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Total Email', value: (summary?.sent || 0) + (summary?.received || 0), icon: '📧' },
                { label: 'Rasio Bounce', value: summary?.bounced && summary?.sent ? `${Math.round((summary.bounced / summary.sent) * 100)}%` : '0%', icon: '⚠️' },
                { label: 'Spam Rate', value: summary?.rejected && summary?.received ? `${Math.round((summary.rejected / (summary.received + summary.rejected)) * 100)}%` : '0%', icon: '🛡️' },
                { label: 'Rata-rata/hari', value: Math.round(((summary?.sent || 0) + (summary?.received || 0)) / 7), icon: '📊' },
              ].map((item) => (
                <div key={item.label} className="bg-muted/30 rounded-xl p-3 text-center hover:bg-muted/50 transition-colors">
                  <div className="text-lg mb-0.5">{item.icon}</div>
                  <div className="text-sm font-bold text-foreground">{item.value}</div>
                  <div className="text-[10px] text-muted-foreground">{item.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
