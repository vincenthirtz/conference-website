// components/admin/bracket/InlineScoreEditor.tsx
// Lightweight inline score entry for the admin bracket (Challonge-style).
// Reuses the existing admin scoring endpoint PATCH /api/admin/matches/[id]
// ({ mode: 'score', team1Score, team2Score }) which propagates the winner
// through the bracket engine. No new scoring path.

import { useState } from 'react';
import { useToast } from '@/components/Toast';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminT } from '@/lib/i18n/useAdminT';

type InlineScoreEditorProps = {
  matchId: string;
  team1Name: string;
  team2Name: string;
  initialScore1: number;
  initialScore2: number;
  onSaved: () => void;
  onCancel: () => void;
};

export default function InlineScoreEditor({
  matchId,
  team1Name,
  team2Name,
  initialScore1,
  initialScore2,
  onSaved,
  onCancel,
}: InlineScoreEditorProps) {
  const t = useAdminT('adminBracketTreeView');
  const { addToast } = useToast();
  const { mutate } = useIdempotentMutation();
  const [s1, setS1] = useState(String(initialScore1));
  const [s2, setS2] = useState(String(initialScore2));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const n1 = parseInt(s1, 10);
    const n2 = parseInt(s2, 10);
    if (!Number.isInteger(n1) || !Number.isInteger(n2) || n1 < 0 || n2 < 0) {
      addToast(t.scoreInvalid, 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await mutate(`/api/admin/matches/${matchId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          mode: 'score',
          team1Score: n1,
          team2Score: n2,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.scoreToastError);
      }
      addToast(t.scoreToastSaved, 'success');
      onSaved();
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.scoreToastError, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-purple-500/40 bg-[#15151f] p-2.5 shadow-2xl shadow-black/50"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-purple-300">
        {t.scoreEditTitle}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2">
          <span
            className="flex-1 truncate text-xs text-white/80"
            title={team1Name}
          >
            {team1Name}
          </span>
          <input
            type="number"
            min={0}
            value={s1}
            autoFocus
            aria-label={team1Name}
            onChange={(e) => setS1(e.target.value)}
            className="w-14 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-center text-sm tabular-nums text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40"
          />
        </label>
        <label className="flex items-center gap-2">
          <span
            className="flex-1 truncate text-xs text-white/80"
            title={team2Name}
          >
            {team2Name}
          </span>
          <input
            type="number"
            min={0}
            value={s2}
            aria-label={team2Name}
            onChange={(e) => setS2(e.target.value)}
            className="w-14 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-center text-sm tabular-nums text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40"
          />
        </label>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-md bg-purple-600 px-2 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-purple-500 disabled:cursor-wait disabled:opacity-60"
        >
          {saving ? t.scoreSaving : t.scoreSave}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-white/10 disabled:opacity-60"
        >
          {t.scoreCancel}
        </button>
      </div>
    </div>
  );
}
