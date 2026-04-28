// components/admin/bracket/BracketTreeView.tsx
// Tree/grid view for bracket-builder (elimination + Swiss/round-robin)

import Image from 'next/image';
import { formatTime } from '@/utils/dateFormatters';
import { STATUS_CONFIG } from '@/utils/statusConfig';
import { parseNotes } from './types';
import type { ScheduleMatch, BracketRound } from './types';

type BracketTreeViewProps = {
  rounds: BracketRound[];
};

const CARD_H = 82;
const CARD_W = 220;
const GAP_BASE = 16;
const CONNECTOR_W = 48;
const HEADER_H = 48;

const SEED_COLORS: Record<string, string> = {
  '1': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  '2': 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  '3': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  '4': 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  '5': 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  '6': 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  '7': 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
  '8': 'bg-lime-500/20 text-lime-300 border-lime-500/30',
};

function bracketTeamLabel(m: ScheduleMatch, slot: 1 | 2) {
  const team = slot === 1 ? m.team1 : m.team2;
  const info = parseNotes(m.notes);
  const seed = (slot === 1 ? info?.seed1 : info?.seed2) ?? null;
  if (team)
    return {
      name: team.short_name ?? team.name,
      logo: team.logo_url,
      hasSeed: !!seed,
      seed,
    };
  if (seed) return { name: `Seed ${seed}`, logo: null, hasSeed: true, seed };
  return { name: 'TBD', logo: null, hasSeed: false, seed: null };
}

export default function BracketTreeView({ rounds }: BracketTreeViewProps) {
  if (!rounds.length) return null;

  const isElimination =
    rounds.length > 1 &&
    rounds[0].matches.length > rounds[rounds.length - 1].matches.length;

  if (!isElimination) {
    return <SwissBracketView rounds={rounds} />;
  }

  return <EliminationBracketView rounds={rounds} />;
}

/* ---- Swiss / Round-Robin grid view ---- */

function SwissBracketView({ rounds }: { rounds: BracketRound[] }) {
  return (
    <div className="space-y-6">
      <div className="overflow-x-auto pb-4">
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: `repeat(${Math.min(rounds.length, 5)}, minmax(200px, 1fr))`,
            minWidth:
              rounds.length > 5 ? `${rounds.length * 212}px` : undefined,
          }}
        >
          {rounds.map((round, roundIdx) => {
            const isFinale =
              roundIdx === rounds.length - 1 &&
              round.matches.length <= 2 &&
              round.roundName.toLowerCase().includes('final');

            return (
              <div key={round.roundNumber} className="flex flex-col">
                <div
                  className={`mb-3 px-3 py-2 rounded-lg border text-center ${
                    isFinale
                      ? 'bg-amber-500/10 border-amber-500/20'
                      : 'bg-purple-500/5 border-purple-500/15'
                  }`}
                >
                  <div
                    className={`text-[11px] font-bold uppercase tracking-wider ${
                      isFinale ? 'text-amber-300' : 'text-purple-300'
                    }`}
                  >
                    {isFinale && <span className="mr-1">&#9733;</span>}
                    {round.roundName}
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">
                    {round.matches.length} match
                    {round.matches.length > 1 ? 's' : ''}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {round.matches.map((m, mIdx) => (
                    <BracketMatchCard
                      key={m.id}
                      match={m}
                      matchIndex={mIdx}
                      isFinale={isFinale}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---- Elimination bracket (tree) view ---- */

function EliminationBracketView({ rounds }: { rounds: BracketRound[] }) {
  const isFinalRound = (idx: number) =>
    idx === rounds.length - 1 && rounds[idx].matches.length === 1;

  const yPositions: number[][] = [];
  for (let r = 0; r < rounds.length; r++) {
    const count = rounds[r].matches.length;
    if (r === 0) {
      const ys: number[] = [];
      for (let i = 0; i < count; i++) ys.push(i * (CARD_H + GAP_BASE));
      yPositions.push(ys);
    } else {
      const prevYs = yPositions[r - 1];
      const ys: number[] = [];
      for (let i = 0; i < count; i++) {
        const top = prevYs[i * 2] ?? prevYs[prevYs.length - 1] ?? 0;
        const bot = prevYs[i * 2 + 1] ?? top;
        ys.push((top + bot) / 2);
      }
      yPositions.push(ys);
    }
  }

  const allYs = yPositions.flat();
  const totalH =
    (allYs.length > 0 ? Math.max(...allYs) : 0) + CARD_H + GAP_BASE;

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex min-w-max" style={{ gap: 0 }}>
        {rounds.map((round, roundIdx) => {
          const ys = yPositions[roundIdx];
          const prevYs = roundIdx > 0 ? yPositions[roundIdx - 1] : null;
          const showConnectors = roundIdx > 0 && prevYs;
          const isFinale = isFinalRound(roundIdx);

          return (
            <div
              key={round.roundNumber}
              className="flex-shrink-0"
              style={{ display: 'flex' }}
            >
              {/* SVG connectors */}
              {showConnectors && (
                <svg
                  width={CONNECTOR_W}
                  height={totalH + HEADER_H}
                  className="flex-shrink-0"
                >
                  {ys.map((y, i) => {
                    const topIdx = i * 2;
                    const botIdx = i * 2 + 1;
                    const topY =
                      (prevYs![topIdx] ?? prevYs![prevYs!.length - 1] ?? 0) +
                      HEADER_H +
                      CARD_H / 2;
                    const botY =
                      (prevYs![botIdx] ?? topY - HEADER_H) +
                      HEADER_H +
                      CARD_H / 2;
                    const midY = y + HEADER_H + CARD_H / 2;
                    const hasTwo = prevYs![botIdx] !== undefined;

                    if (!hasTwo) {
                      return (
                        <line
                          key={i}
                          x1={0}
                          y1={topY}
                          x2={CONNECTOR_W}
                          y2={midY}
                          stroke="rgba(139,92,246,0.25)"
                          strokeWidth={1.5}
                        />
                      );
                    }

                    return (
                      <g key={i}>
                        <line
                          x1={0}
                          y1={topY}
                          x2={CONNECTOR_W / 2}
                          y2={topY}
                          stroke="rgba(139,92,246,0.25)"
                          strokeWidth={1.5}
                        />
                        <line
                          x1={0}
                          y1={botY}
                          x2={CONNECTOR_W / 2}
                          y2={botY}
                          stroke="rgba(139,92,246,0.25)"
                          strokeWidth={1.5}
                        />
                        <line
                          x1={CONNECTOR_W / 2}
                          y1={topY}
                          x2={CONNECTOR_W / 2}
                          y2={botY}
                          stroke="rgba(139,92,246,0.25)"
                          strokeWidth={1.5}
                        />
                        <line
                          x1={CONNECTOR_W / 2}
                          y1={midY}
                          x2={CONNECTOR_W}
                          y2={midY}
                          stroke="rgba(139,92,246,0.3)"
                          strokeWidth={1.5}
                        />
                        <circle
                          cx={CONNECTOR_W / 2}
                          cy={topY}
                          r={2}
                          fill="rgba(139,92,246,0.4)"
                        />
                        <circle
                          cx={CONNECTOR_W / 2}
                          cy={botY}
                          r={2}
                          fill="rgba(139,92,246,0.4)"
                        />
                        <circle
                          cx={CONNECTOR_W / 2}
                          cy={midY}
                          r={2.5}
                          fill="rgba(139,92,246,0.5)"
                        />
                      </g>
                    );
                  })}
                </svg>
              )}

              {/* Round column */}
              <div className="flex-shrink-0 relative" style={{ width: CARD_W }}>
                <div
                  className="flex items-center justify-center gap-2"
                  style={{ height: HEADER_H }}
                >
                  <div
                    className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider whitespace-nowrap border ${
                      isFinale
                        ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                        : 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                    }`}
                  >
                    {isFinale && <span className="mr-1">&#9733;</span>}
                    {round.roundName}
                  </div>
                </div>

                <div className="relative" style={{ height: totalH }}>
                  {round.matches.map((m, mIdx) => (
                    <div
                      key={m.id}
                      className="absolute left-0 right-0"
                      style={{ top: ys[mIdx], height: CARD_H }}
                    >
                      <BracketMatchCard
                        match={m}
                        matchIndex={mIdx}
                        isFinale={isFinale}
                        fixedHeight
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- Shared match card for bracket views ---- */

function BracketMatchCard({
  match: m,
  matchIndex: mIdx,
  isFinale,
  fixedHeight,
}: {
  match: ScheduleMatch;
  matchIndex: number;
  isFinale: boolean;
  fixedHeight?: boolean;
}) {
  const statusCfg = STATUS_CONFIG[m.status];
  const t1 = bracketTeamLabel(m, 1);
  const t2 = bracketTeamLabel(m, 2);
  const w1 = !!m.winner_team_id && m.winner_team_id === m.team1_id;
  const w2 = !!m.winner_team_id && m.winner_team_id === m.team2_id;
  const posLabel = m.position_in_round ?? mIdx + 1;

  return (
    <div
      className={`rounded-xl border overflow-hidden transition-all ${fixedHeight ? 'h-full' : ''} ${
        isFinale
          ? 'bg-gradient-to-br from-amber-950/30 via-[#12121a] to-purple-950/30 border-amber-500/20 shadow-xl shadow-amber-500/5'
          : m.status === 'finished'
            ? 'bg-[#12121a] border-white/[0.08]'
            : 'bg-[#12121a] border-white/[0.06] hover:border-purple-500/20'
      }`}
    >
      <div
        className="flex items-center justify-between px-2.5 py-1 border-b border-white/[0.05]"
        style={{ height: 26 }}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold text-neutral-600 font-mono">
            #{posLabel}
          </span>
          {m.scheduled_at && (
            <span className="text-[10px] tabular-nums text-neutral-400 font-medium">
              {formatTime(m.scheduled_at)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {m.match_format && (
            <span className="text-[9px] font-semibold uppercase text-neutral-500 bg-white/5 px-1 rounded">
              {m.match_format}
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

      <BracketTeamRow t={t1} isWinner={w1} />
      <div className="h-px bg-white/[0.04]" />
      <BracketTeamRow t={t2} isWinner={w2} />
    </div>
  );
}

function BracketTeamRow({
  t,
  isWinner,
}: {
  t: {
    name: string;
    logo: string | null;
    hasSeed: boolean;
    seed: string | null;
  };
  isWinner: boolean;
}) {
  const rowH = (CARD_H - 26) / 2;
  return (
    <div
      className={`flex items-center gap-2 px-2.5 ${isWinner ? 'bg-emerald-500/[0.07]' : ''}`}
      style={{ height: rowH }}
    >
      {t.seed && (
        <span
          className={`inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-extrabold border ${
            SEED_COLORS[t.seed] ??
            'bg-neutral-500/20 text-neutral-400 border-neutral-500/30'
          }`}
        >
          {t.seed}
        </span>
      )}
      {t.logo && (
        <Image
          src={t.logo}
          alt=""
          width={16}
          height={16}
          className="w-4 h-4 rounded object-cover flex-shrink-0"
        />
      )}
      <span
        className={`text-xs truncate flex-1 ${
          isWinner
            ? 'text-emerald-300 font-semibold'
            : t.name === 'TBD'
              ? 'text-neutral-600 italic'
              : 'text-white/80'
        }`}
      >
        {t.hasSeed && t.seed
          ? t.name.replace(/^Seed \d+$/, '') || t.name
          : t.name}
      </span>
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
