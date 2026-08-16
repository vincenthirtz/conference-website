// components/admin/draft/HeroPool.tsx
// Filterable grid of every champion / hero for the current draft. Heroes
// that have already been banned/picked in this draft (or in any previous
// game of a fearless series) are greyed out and disabled.
//
// onPick is called with the hero id when the operator clicks a hero. The
// parent (page) wires that to POST /api/admin/.../commit.

import { useMemo, useState } from 'react';
import type { GameHero, DraftState } from '@/types/draft';

type Props = {
  heroes: GameHero[];
  state: DraftState | null;
  /** Disable interactions (no current step, draft completed, etc.). */
  disabled?: boolean;
  onPick: (heroId: string) => Promise<void> | void;
  /** Optional list of hero ids that should also count as locked
   *  (e.g. fearless cross-game picks resolved on the client). */
  extraLockedIds?: Set<string>;
};

export function HeroPool({
  heroes,
  state,
  disabled,
  onPick,
  extraLockedIds,
}: Props) {
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const locked = useMemo(() => {
    const s = new Set<string>(extraLockedIds ?? []);
    if (state) {
      for (const h of state.bannedHeroes) s.add(h.id);
      for (const h of state.team1Picks) s.add(h.id);
      for (const h of state.team2Picks) s.add(h.id);
    }
    return s;
  }, [state, extraLockedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return heroes;
    return heroes.filter(
      (h) => h.name.toLowerCase().includes(q) || h.key.toLowerCase().includes(q)
    );
  }, [heroes, query]);

  async function click(heroId: string) {
    if (disabled || locked.has(heroId) || busyId) return;
    setBusyId(heroId);
    try {
      await onPick(heroId);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-700/50 bg-neutral-900/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
          Hero pool ({filtered.length}/{heroes.length})
        </div>
        <input
          type="search"
          placeholder="Filter heroes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-white placeholder:text-neutral-500 focus:border-emerald-500 focus:outline-none"
        />
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {filtered.map((hero) => {
          const isLocked = locked.has(hero.id);
          const isBusy = busyId === hero.id;
          return (
            <button
              key={hero.id}
              type="button"
              disabled={disabled || isLocked || isBusy}
              onClick={() => click(hero.id)}
              title={hero.name}
              className={`group relative aspect-square overflow-hidden rounded-lg border transition ${
                isLocked
                  ? 'border-neutral-800 opacity-30 grayscale'
                  : 'border-neutral-700 hover:border-emerald-500 hover:ring-2 hover:ring-emerald-500/40'
              } ${isBusy ? 'opacity-60' : ''} disabled:cursor-not-allowed`}
            >
              {hero.icon_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={hero.icon_url}
                  alt={hero.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-neutral-800 text-xs text-neutral-400">
                  {hero.key}
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-1 py-0.5 text-[10px] text-white">
                {hero.name}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
