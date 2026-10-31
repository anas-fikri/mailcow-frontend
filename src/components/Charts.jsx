import React from 'react';
import { progressPercent } from '../lib/progressPercent';

// ─── Stat Card ────────────────────────────────────────────────────────────────
export function StatCard({ icon: Icon, label, value, sub, trend, color = 'primary', loading }) {
  const colorMap = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-green-500/10 text-green-600 dark:text-green-400',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    destructive: 'bg-destructive/10 text-destructive',
    info: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-sm p-5 space-y-3 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-4 w-24 bg-muted rounded" />
          <div className="w-8 h-8 bg-muted rounded-lg" />
        </div>
        <div className="h-8 w-16 bg-muted rounded" />
        <div className="h-3 w-32 bg-muted rounded" />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        {Icon && (
          <div className={`w-8 h-8 rounded-md ${colorMap[color] || colorMap.primary} flex items-center justify-center`}>
            <Icon size={16} />
          </div>
        )}
      </div>
      <div className="text-2xl font-semibold text-foreground tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      {trend && (
        <div className={`text-xs mt-1.5 font-medium ${trend.startsWith('+') ? 'text-green-500' : trend.startsWith('-') ? 'text-red-500' : 'text-muted-foreground'}`}>
          {trend} dari minggu lalu
        </div>
      )}
    </div>
  );
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────
export function BarChart({ data, bars, height = 200, colors, loading }) {
  if (loading) {
    return <div className="h-[200px] bg-muted/30 rounded-lg animate-pulse" />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
        Belum ada data
      </div>
    );
  }

  const barKeys = Array.isArray(bars) ? bars : [bars];
  const barColors = colors || ['#3b82f6', '#22c55e', '#ef4444', '#f59e0b'];
  const padding = 0.2; // 20% padding between groups

  // Hitung max value untuk scaling
  const maxVal = Math.max(...data.flatMap((d) => barKeys.map((k) => d[k] || 0)));
  const scaleMax = maxVal * 1.15; // 15% extra space at top

  const groupWidth = 100 / data.length;
  const barWidth = (groupWidth * (1 - padding)) / barKeys.length;

  return (
    <div className="w-full" style={{ height }}>
      <svg width="100%" height={height} viewBox={`0 0 ${data.length * 60} ${height}`} preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = height * (1 - ratio);
          return (
            <g key={ratio}>
              <line x1="0" y1={y} x2={data.length * 60} y2={y} stroke="currentColor" className="text-border/50" strokeWidth="1" />
              <text x="2" y={y - 4} className="fill-muted-foreground" fontSize="11">
                {Math.round(scaleMax * ratio)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const x = i * 60 + 10;
          return (
            <g key={i}>
              {barKeys.map((key, bi) => {
                const val = d[key] || 0;
                const barH = (val / scaleMax) * (height - 25);
                const bx = x + bi * (barWidth + 2);
                return (
                  <rect
                    key={key}
                    x={bx}
                    y={height - 15 - barH}
                    width={Math.max(barWidth, 6)}
                    height={Math.max(barH, 2)}
                    rx="3"
                    fill={barColors[bi % barColors.length]}
                    opacity="0.85"
                    className="hover:opacity-100 transition-opacity"
                  >
                    <title>{d.date}: {key} = {val}</title>
                  </rect>
                );
              })}
              {/* X-axis label */}
              <text
                x={x + (barKeys.length * (barWidth + 2)) / 2}
                y={height - 2}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize="11"
              >
                {d.date}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────
export function DonutChart({ data, size = 140, loading }) {
  if (loading) {
    // Kelas Tailwind tidak bisa dibuat dinamis dari template literal (`w-[${size}px]`
    // tidak pernah di-generate JIT) — pakai inline style agar ukurannya benar.
    return <div className="bg-muted/30 rounded-full animate-pulse" style={{ width: size, height: size }} />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground">
        Tidak ada data
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground">
        Tidak ada data
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 12;
  const strokeWidth = 20;

  let currentAngle = -90;

  // Filter out zero values
  const segments = data.filter((d) => d.value > 0);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segments.map((seg, i) => {
          const pct = seg.value / total;
          const angle = pct * 360;
          const startAngle = currentAngle;
          const endAngle = currentAngle + angle;
          currentAngle = endAngle;

          // Convert to radians
          const startRad = (startAngle * Math.PI) / 180;
          const endRad = (endAngle * Math.PI) / 180;

          // Calculate arc path
          const x1 = cx + radius * Math.cos(startRad);
          const y1 = cy + radius * Math.sin(startRad);
          const x2 = cx + radius * Math.cos(endRad);
          const y2 = cy + radius * Math.sin(endRad);
          const largeArc = angle > 180 ? 1 : 0;

          const path = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

          return (
            <path
              key={i}
              d={path}
              fill={seg.color || '#3b82f6'}
              opacity="0.85"
              className="hover:opacity-100 transition-opacity"
            >
              <title>{seg.label}: {seg.value} ({Math.round(pct * 100)}%)</title>
            </path>
          );
        })}
        {/* Inner hole */}
        <circle cx={cx} cy={cy} r={radius - strokeWidth + 4} fill="var(--color-background)" />
        {/* Center text */}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-foreground" fontSize="16" fontWeight="bold">
          {total}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="fill-muted-foreground" fontSize="11">
          Total
        </text>
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 justify-center">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: seg.color }} />
            {seg.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
export function ProgressBar({ value, max, label, color = 'primary' }) {
  const pct = progressPercent(value, max);
  const colorMap = {
    primary: 'bg-primary',
    success: 'bg-green-500',
    warning: 'bg-amber-500',
    destructive: 'bg-destructive',
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">{pct}%</span>
      </div>
      <div className="h-2.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colorMap[color] || colorMap.primary}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-muted-foreground">
        {value} / {max}
      </div>
    </div>
  );
}
