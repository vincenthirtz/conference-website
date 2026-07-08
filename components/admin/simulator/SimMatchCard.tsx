// Visual card for a single simulated match. Used by EliminationView and the
// main simulator page. Re-exports SEED_COLORS and CARD_H because both are
// referenced from the page (standings table) and from the bracket layout.

import { memo } from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { STATUS_CONFIG } from '@/utils/statusConfig';
import { computeWinProbability } from '@/utils/simulator';
import type { SimMatch } from '@/utils/simulator';
import { formatMatchDate } from '@/utils/simulatorFakeData';

export const CARD_H = 82;

export const SEED_COLORS: Record<number, string> = {
  1: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  2: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  3: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  4: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  5: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  6: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  7: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
  8: 'bg-lime-500/20 text-lime-300 border-lime-500/30',
};

function SimTeamRow({
  name,
  score,
  isWinner,
  seed,
}: {
  name: string;
  score: number | null;
  isWinner: boolean;
  seed: number | null;
}) {
  const rowH = (CARD_H - 26) / 2;
  return (
    <div
      className={`flex items-center gap-2 px-2.5 ${isWinner ? 'bg-emerald-500/[0.07]' : ''}`}
      style={{ height: rowH }}
    >
      {seed && seed <= 8 && (
        <span
          className={`inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-extrabold border ${
            SEED_COLORS[seed] ??
            'bg-neutral-500/20 text-neutral-400 border-neutral-500/30'
          }`}
        >
          {seed}
        </span>
      )}
      <span
        className={`text-xs truncate flex-1 ${
          isWinner
            ? 'text-emerald-300 font-semibold'
            : name === 'TBD'
              ? 'text-neutral-600 italic'
              : 'text-white/80'
        }`}
      >
        {name}
      </span>
      {score !== null && (
        <span
          className={`text-xs font-bold tabular-nums ${isWinner ? 'text-emerald-300' : 'text-neutral-500'}`}
        >
          {score}
        </span>
      )}
      {isWinner && (
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          className="flex-shrink-0 text-emerald-400"
        >
          <path
            d="M3 8.5l3 3 7-7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}

// Handlers receive the match id and are called internally, so callers can pass
// a single stable reference per stage instead of a fresh arrow per match. This
// keeps props referentially stable, which is what makes the memo() below skip
// re-rendering unchanged cards when sibling matches update.
function SimMatchCardComponent({
  match,
  onSimulate,
  onReset,
  onToggleLock,
}: {
  match: SimMatch;
  onSimulate: (matchId: string) => void;
  onReset: (matchId: string) => void;
  onToggleLock?: (matchId: string) => void;
}) {
  const t = useAdminT('adminSimulatorSimMatchCard');
  const statusCfg = STATUS_CONFIG[match.status];
  const t1Name = match.team1?.short_name ?? match.team1?.name ?? 'TBD';
  const t2Name = match.team2?.short_name ?? match.team2?.name ?? 'TBD';
  const w1 = match.winner_team_id === match.team1_id && !!match.winner_team_id;
  const w2 = match.winner_team_id === match.team2_id && !!match.winner_team_id;
  const winProb =
    match.team1 && match.team2
      ? computeWinProbability(match.team1, match.team2)
      : null;

  return (
    <div
      className={`rounded-xl border overflow-hidden bg-[#12121a] transition-all duration-300 ${
        match.locked
          ? 'border-amber-500/30 ring-1 ring-amber-500/10'
          : match.status === 'finished'
            ? 'border-emerald-500/20 shadow-[0_0_12px_-3px_rgba(16,185,129,0.15)]'
            : 'border-white/[0.06] hover:border-purple-500/20'
      }`}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-2.5 py-1 border-b border-white/[0.05]"
        style={{ height: 26 }}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold text-neutral-600 font-mono">
            #{match.position_in_round}
          </span>
          {match.scheduled_at && (
            <span
              className="text-[9px] text-purple-300/70 font-mono"
              title={match.scheduled_at}
            >
              {formatMatchDate(match.scheduled_at)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {match.match_format && (
            <span className="text-[9px] font-semibold uppercase text-neutral-500 bg-white/5 px-1 rounded">
              {match.match_format}
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[9px] font-medium border ${statusCfg.bg}`}
          >
            <span className={`w-1 h-1 rounded-full ${statusCfg.dot}`} />
            {statusCfg.label}
          </span>
        </div>
      </div>

      {/* Team rows */}
      <SimTeamRow
        name={t1Name}
        score={match.team1_score}
        isWinner={w1}
        seed={match.team1?.seed ?? null}
      />
      <div className="h-px bg-white/[0.04]" />
      <SimTeamRow
        name={t2Name}
        score={match.team2_score}
        isWinner={w2}
        seed={match.team2?.seed ?? null}
      />

      {/* Win probability bar */}
      {winProb !== null && match.status === 'pending' && (
        <div className="px-2.5 py-1 border-t border-white/[0.05]">
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] tabular-nums text-sky-300 font-semibold w-8 text-right">
              {Math.round(winProb * 100)}%
            </span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-neutral-800 flex">
              <div
                className="h-full bg-sky-500/60 rounded-l-full transition-all"
                style={{ width: `${winProb * 100}%` }}
              />
              <div
                className="h-full bg-rose-500/60 rounded-r-full transition-all"
                style={{ width: `${(1 - winProb) * 100}%` }}
              />
            </div>
            <span className="text-[8px] tabular-nums text-rose-300 font-semibold w-8">
              {Math.round((1 - winProb) * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex border-t border-white/[0.05]">
        {match.status === 'pending' &&
          match.team1 &&
          match.team2 &&
          !match.locked && (
            <button
              onClick={() => onSimulate(match.id)}
              className="flex-1 text-[10px] py-1.5 text-emerald-400 hover:bg-emerald-500/10 transition-colors font-semibold"
            >
              {t.simulate}
            </button>
          )}
        {match.status === 'finished' && !match.locked && (
          <button
            onClick={() => onReset(match.id)}
            className="flex-1 text-[10px] py-1.5 text-amber-400 hover:bg-amber-500/10 transition-colors font-semibold"
          >
            Reset
          </button>
        )}
        {match.status === 'pending' &&
          (!match.team1 || !match.team2) &&
          !match.locked && (
            <span className="flex-1 text-[10px] py-1.5 text-neutral-600 text-center italic">
              {t.waiting}
            </span>
          )}
        {match.locked && (
          <span className="flex-1 text-[10px] py-1.5 text-amber-400 text-center font-semibold">
            {t.locked}
          </span>
        )}
        {onToggleLock &&
          (match.status === 'finished' ||
            (match.status === 'pending' && match.team1 && match.team2)) && (
            <button
              onClick={() => onToggleLock(match.id)}
              className={`px-2.5 text-[10px] py-1.5 transition-colors font-semibold border-l border-white/[0.05] ${
                match.locked
                  ? 'text-amber-400 hover:bg-amber-500/10'
                  : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-300'
              }`}
              title={match.locked ? t.unlockTitle : t.lockTitle}
            >
              {match.locked ? '\u{1F512}' : '\u{1F513}'}
            </button>
          )}
      </div>

      {/* Maps with per-map results */}
      {match.maps.length > 0 && (
        <div className="border-t border-white/[0.05] px-2.5 py-1.5">
          <div className="flex flex-wrap gap-1">
            {match.maps.map((map, i) => {
              const mapWon = map.winner_team_id;
              const t1Won = mapWon === match.team1_id;
              const t2Won = mapWon === match.team2_id;
              return (
                <span
                  key={i}
                  className={`text-[8px] px-1.5 py-0.5 rounded border ${
                    t1Won
                      ? 'bg-sky-500/10 text-sky-300 border-sky-500/20'
                      : t2Won
                        ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                        : 'bg-white/5 text-neutral-500 border-transparent'
                  }`}
                  title={
                    mapWon
                      ? format(t.wonBy, { name: t1Won ? t1Name : t2Name })
                      : map.mode
                  }
                >
                  {map.name}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Memoized: only re-renders when its own `match` object (or a handler ref)
// changes. Callers pass stable per-stage handlers, so simulating/resetting one
// match no longer re-renders the whole bracket.
export const SimMatchCard = memo(SimMatchCardComponent);
