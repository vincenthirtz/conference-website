import type { JSX } from 'react';

const PULSE = 'animate-pulse rounded-xl bg-white/[0.04] border border-white/10';

export function SkeletonLine({
  className = '',
  width = 'w-full',
  height = 'h-4',
}: {
  className?: string;
  width?: string;
  height?: string;
}): JSX.Element {
  return (
    <div
      className={`animate-pulse rounded bg-white/[0.06] ${width} ${height} ${className}`}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard({
  className = '',
}: {
  className?: string;
}): JSX.Element {
  return (
    <div className={`${PULSE} p-6 ${className}`} aria-hidden="true">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-full bg-white/[0.06]" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/2 rounded bg-white/[0.06]" />
          <div className="h-3 w-1/3 rounded bg-white/[0.04]" />
        </div>
      </div>
      <div className="mt-6 space-y-2">
        <div className="h-3 w-full rounded bg-white/[0.04]" />
        <div className="h-3 w-5/6 rounded bg-white/[0.04]" />
      </div>
    </div>
  );
}

/**
 * Full-page skeleton matching the /player dashboard layout: header,
 * profile + team cards row, next match block, quick actions grid.
 */
export function PlayerDashboardSkeleton(): JSX.Element {
  return (
    <div
      className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white"
      aria-busy="true"
      aria-live="polite"
    >
      <main className="max-w-4xl mx-auto px-4 py-10 pt-24">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div className="space-y-3">
            <SkeletonLine width="w-64" height="h-7" />
            <SkeletonLine width="w-48" height="h-3" />
          </div>
          <SkeletonLine width="w-28" height="h-10" />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>

        <SkeletonCard className="mt-6" />

        <div className={`${PULSE} mt-6 p-6`} aria-hidden="true">
          <SkeletonLine width="w-40" height="h-5" className="mb-4" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/[0.04]"
              >
                <div className="h-5 w-5 rounded bg-white/[0.06]" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-2/3 rounded bg-white/[0.06]" />
                  <div className="h-2.5 w-1/2 rounded bg-white/[0.04]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * Compact full-page loader for the simpler captain pages (manage-team,
 * messages, requests…). Replaces the centered "Chargement…" text.
 */
export function PlayerPageSkeleton({
  rows = 3,
}: { rows?: number } = {}): JSX.Element {
  return (
    <div
      className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white"
      aria-busy="true"
      aria-live="polite"
    >
      <main className="max-w-4xl mx-auto px-4 py-10 pt-24 space-y-6">
        <div className="space-y-3">
          <SkeletonLine width="w-1/3" height="h-7" />
          <SkeletonLine width="w-2/3" height="h-3" />
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </main>
    </div>
  );
}
