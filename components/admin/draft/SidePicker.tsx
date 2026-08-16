// components/admin/draft/SidePicker.tsx
// Side selection UI for the captain UI (Lot 4). Game-specific enum :
//   - lol  → blue | red
//   - dota2 → radiant | dire
// Shows the current selection (if any) and submits when the operator clicks
// a fresh combination. Disabled once a step has been committed.

import { useState, useEffect } from 'react';

type Game = 'lol' | 'dota2';

type Props = {
  game: Game;
  currentTeam1Side: string | null;
  currentTeam2Side: string | null;
  disabled?: boolean;
  onSubmit: (team1Side: string, team2Side: string) => Promise<void> | void;
};

const SIDES: Record<Game, readonly [string, string]> = {
  lol: ['blue', 'red'],
  dota2: ['radiant', 'dire'],
};

const LABELS: Record<string, string> = {
  blue: 'Blue side',
  red: 'Red side',
  radiant: 'Radiant',
  dire: 'Dire',
};

export function SidePicker({
  game,
  currentTeam1Side,
  currentTeam2Side,
  disabled,
  onSubmit,
}: Props) {
  const [team1, setTeam1] = useState<string | null>(currentTeam1Side);
  const [team2, setTeam2] = useState<string | null>(currentTeam2Side);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTeam1(currentTeam1Side);
    setTeam2(currentTeam2Side);
  }, [currentTeam1Side, currentTeam2Side]);

  const [sideA, sideB] = SIDES[game];

  function pickTeam1(side: string) {
    setTeam1(side);
    setTeam2(side === sideA ? sideB : sideA);
  }

  const dirty = team1 !== currentTeam1Side || team2 !== currentTeam2Side;
  const valid = !!team1 && !!team2 && team1 !== team2;

  async function submit() {
    if (!valid || !dirty || disabled) return;
    setBusy(true);
    try {
      await onSubmit(team1!, team2!);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-700/50 bg-neutral-900/40 p-4">
      <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-400">
        Side selection
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="mb-1 text-xs text-neutral-500">Team 1</div>
          <div className="flex gap-2">
            {SIDES[game].map((s) => (
              <button
                key={s}
                type="button"
                disabled={disabled || busy}
                onClick={() => pickTeam1(s)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  team1 === s
                    ? 'border-emerald-500 bg-emerald-600/30 text-white'
                    : 'border-neutral-700 bg-neutral-800/50 text-neutral-300 hover:border-neutral-500'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {LABELS[s] ?? s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs text-neutral-500">Team 2 (mirror)</div>
          <div className="flex gap-2">
            {SIDES[game].map((s) => (
              <div
                key={s}
                className={`flex-1 rounded-lg border px-3 py-2 text-center text-sm font-medium ${
                  team2 === s
                    ? 'border-emerald-500 bg-emerald-600/30 text-white'
                    : 'border-neutral-800 bg-neutral-900/50 text-neutral-500'
                }`}
              >
                {LABELS[s] ?? s}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={!valid || !dirty || busy || disabled}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save sides'}
        </button>
      </div>
    </div>
  );
}
