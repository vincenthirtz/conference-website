// Bracket / column-style view for a sequence of rounds in the simulator.
// Renders either a flat grid (Swiss / Round-Robin) or a tree layout
// (single/double elimination) depending on whether the round sizes shrink.

import { memo } from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { SimMatchCard, CARD_H } from './SimMatchCard';
import type { SimMatch } from '@/utils/simulator';
import nsAdminSimulatorEliminationView from '@/lib/i18n/locales/admin-fr/adminSimulatorEliminationView';

const CARD_W = 220;
const GAP_BASE = 16;
const CONNECTOR_W = 48;
const HEADER_H = 48;

export type RoundGroup = {
  roundNumber: number;
  roundName: string;
  matches: SimMatch[];
};

export function groupByRound(
  matches: SimMatch[],
  side?: 'wb' | 'lb' | 'final'
): RoundGroup[] {
  const filtered = side
    ? matches.filter((m) => m.bracket_side === side)
    : matches;
  const map = new Map<number, RoundGroup>();
  for (const m of filtered) {
    const rn = m.round_number;
    if (!map.has(rn))
      map.set(rn, { roundNumber: rn, roundName: m.round_name, matches: [] });
    map.get(rn)!.matches.push(m);
  }
  return Array.from(map.values()).sort((a, b) => a.roundNumber - b.roundNumber);
}

function EliminationViewComponent({
  rounds,
  onSimulate,
  onReset,
  onToggleLock,
  label,
  accentColor,
}: {
  rounds: RoundGroup[];
  onSimulate: (matchId: string) => void;
  onReset: (matchId: string) => void;
  onToggleLock?: (matchId: string) => void;
  label?: string;
  accentColor?: string;
}) {
  const t = useAdminT(nsAdminSimulatorEliminationView);
  if (!rounds.length) return null;

  const isTree =
    rounds.length > 1 &&
    rounds[0].matches.length > rounds[rounds.length - 1].matches.length;

  if (!isTree) {
    return (
      <div className="space-y-2">
        {label && (
          <p
            className={`text-xs uppercase tracking-wider font-semibold ${accentColor ?? 'text-purple-300'}`}
          >
            {label}
          </p>
        )}
        <div className="overflow-x-auto pb-4">
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(${Math.min(rounds.length, 6)}, minmax(220px, 1fr))`,
              minWidth:
                rounds.length > 6 ? `${rounds.length * 232}px` : undefined,
            }}
          >
            {rounds.map((round) => (
              <div key={round.roundNumber} className="flex flex-col">
                <div className="mb-3 px-3 py-2 rounded-lg border bg-purple-500/5 border-purple-500/15 text-center">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-purple-300">
                    {round.roundName}
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">
                    {format(
                      round.matches.length > 1 ? t.match_other : t.match_one,
                      { count: round.matches.length }
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {round.matches.map((m) => (
                    <SimMatchCard
                      key={m.id}
                      match={m}
                      onSimulate={onSimulate}
                      onReset={onReset}
                      onToggleLock={onToggleLock}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Tree layout
  const yPositions: number[][] = [];
  for (let r = 0; r < rounds.length; r++) {
    const count = rounds[r].matches.length;
    if (r === 0) {
      yPositions.push(
        Array.from({ length: count }, (_, i) => i * (CARD_H + GAP_BASE))
      );
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
    (allYs.length > 0 ? Math.max(...allYs) : 0) + CARD_H + GAP_BASE + 40;

  return (
    <div className="space-y-2">
      {label && (
        <p
          className={`text-xs uppercase tracking-wider font-semibold ${accentColor ?? 'text-purple-300'}`}
        >
          {label}
        </p>
      )}
      <div className="overflow-x-auto pb-4">
        <div className="flex min-w-max gap-0">
          {rounds.map((round, roundIdx) => {
            const ys = yPositions[roundIdx];
            const prevYs = roundIdx > 0 ? yPositions[roundIdx - 1] : null;
            const showConnectors = roundIdx > 0 && prevYs;
            const isFinale =
              roundIdx === rounds.length - 1 && round.matches.length === 1;

            return (
              <div
                key={round.roundNumber}
                className="flex-shrink-0"
                style={{ display: 'flex' }}
              >
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

                <div
                  className="flex-shrink-0 relative"
                  style={{ width: CARD_W }}
                >
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
                        style={{ top: ys[mIdx] }}
                      >
                        <SimMatchCard
                          match={m}
                          onSimulate={onSimulate}
                          onReset={onReset}
                          onToggleLock={onToggleLock}
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
    </div>
  );
}

// Memoized: with stable handler props and referentially stable `rounds`
// (the page memoizes groupByRound per stage), an unchanged stage skips
// re-rendering entirely when another stage's matches update.
export const EliminationView = memo(EliminationViewComponent);
