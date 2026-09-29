// components/admin/draft/SidePicker.tsx
// Side selection UI for the captain UI (Lot 4). Game-specific enum :
//   - lol  → blue | red
//   - dota2 → radiant | dire
// Shows the current selection (if any) and submits when the operator clicks
// a fresh combination. Disabled once a step has been committed.

import { useState, useEffect } from 'react';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';

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
    <div className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4">
      <div className="mb-3 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
        Side selection
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="mb-1 text-xs text-[var(--t4,#807984)]">Team 1</div>
          <div className="flex gap-2">
            {SIDES[game].map((s) => (
              <button
                key={s}
                type="button"
                disabled={disabled || busy}
                onClick={() => pickTeam1(s)}
                className={`flex-1 rounded-[var(--r-ctrl,4px)] border px-3 py-2 text-sm font-medium transition ${
                  team1 === s
                    ? 'border-[rgba(180,103,209,.55)] bg-[rgba(180,103,209,.14)] text-[var(--or-100,#f6e1ff)]'
                    : 'border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] text-[var(--t2,#c7bfca)] hover:border-[var(--t4,#807984)]'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {LABELS[s] ?? s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs text-[var(--t4,#807984)]">
            Team 2 (mirror)
          </div>
          <div className="flex gap-2">
            {SIDES[game].map((s) => (
              <div
                key={s}
                className={`flex-1 rounded-[var(--r-ctrl,4px)] border px-3 py-2 text-center text-sm font-medium ${
                  team2 === s
                    ? 'border-[rgba(180,103,209,.55)] bg-[rgba(180,103,209,.14)] text-[var(--or-100,#f6e1ff)]'
                    : 'border-[var(--line,rgba(194,196,201,.12))] text-[var(--t4,#807984)]'
                }`}
              >
                {LABELS[s] ?? s}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <AdminButton
          variant="primary"
          size="sm"
          onClick={submit}
          disabled={!valid || !dirty || busy || disabled}
        >
          {busy ? 'Saving…' : 'Save sides'}
        </AdminButton>
      </div>
    </div>
  );
}
