import React from 'react';

// ─── Base Skeleton ────────────────────────────────────────────────────────────
function Skeleton({ className = '', ...props }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-muted/60 ${className}`}
      {...props}
    />
  );
}

// ─── Message List Skeleton ────────────────────────────────────────────────────
export function MessageListSkeleton({ count = 6 }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 p-3">
          {/* Checkbox */}
          <Skeleton className="w-4 h-4 rounded mt-1" />
          {/* Content */}
          <div className="flex-1 space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          {/* Unread dot */}
          <Skeleton className="w-2 h-2 rounded-full shrink-0 mt-2" />
        </div>
      ))}
    </div>
  );
}

// ─── Message Reader Skeleton ──────────────────────────────────────────────────
export function MessageReaderSkeleton() {
  return (
    <div className="flex flex-col h-full p-6 space-y-6">
      {/* Toolbar skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <Skeleton className="w-8 h-8 rounded-lg" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="w-16 h-8 rounded-lg" />
          <Skeleton className="w-20 h-8 rounded-lg" />
        </div>
      </div>
      {/* Header */}
      <div className="space-y-3">
        <Skeleton className="h-6 w-3/4" />
        <div className="space-y-2">
          <div className="flex gap-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      </div>
      {/* Body */}
      <div className="space-y-3 flex-1">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

// ─── Contacts List Skeleton ──────────────────────────────────────────────────
export function ContactsListSkeleton({ count = 6 }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3">
          <Skeleton className="w-9 h-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-3 w-20 hidden sm:block" />
        </div>
      ))}
    </div>
  );
}

// ─── Calendar Grid Skeleton ───────────────────────────────────────────────────
export function CalendarGridSkeleton() {
  return (
    <div className="grid grid-cols-7">
      {Array.from({ length: 35 }).map((_, i) => (
        <div key={i} className="min-h-[80px] border-b border-r border-border/40 p-1.5">
          <Skeleton className="w-7 h-7 rounded-full mb-2" />
          <div className="space-y-1">
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-3 w-3/4 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Folders List Skeleton ────────────────────────────────────────────────────
export function FoldersListSkeleton({ count = 5 }) {
  return (
    <div className="p-3 space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-3">
            <Skeleton className="w-4 h-4" />
            <Skeleton className="h-4 w-24" />
          </div>
          {i === 0 && <Skeleton className="w-6 h-5 rounded-full" />}
        </div>
      ))}
    </div>
  );
}

// ─── Table / Stats skeleton ──────────────────────────────────────────────────
export function StatsCardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="w-8 h-8 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export default Skeleton;
