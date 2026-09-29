// components/admin/dashboard/ScoreEntryModal.tsx
// Modale légère pour saisir le score d'un match sans quitter le dashboard.
// Appelle PATCH /api/admin/matches/[matchId] avec { team1Score, team2Score, status }.

import { useState } from 'react';
import {
  useIdempotentMutation,
  BgSyncQueuedError,
} from '@/hooks/useIdempotentMutation';
import { matchesPaths } from '@/features/admin/matches/client';
import { useToast } from '@/components/Toast';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminDashboardScoreEntryModal from '@/lib/i18n/locales/admin-fr/adminDashboardScoreEntryModal';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { rubanErr } from '@/features/admin/_shared/ui/ruban';

type Props = {
  open: boolean;
  matchId: string;
  team1Name: string | null;
  team2Name: string | null;
  initialTeam1Score?: number | null;
  initialTeam2Score?: number | null;
  /** BO format pour proposer un winning-score implicite (ex: bo3 → max 2). */
  matchFormat?: string | null;
  onClose: () => void;
  onSuccess?: () => void;
};

const FORMAT_MAX_WINS: Record<string, number> = {
  bo1: 1,
  bo2: 2,
  bo3: 2,
  bo5: 3,
  bo7: 4,
};

export default function ScoreEntryModal({
  open,
  matchId,
  team1Name,
  team2Name,
  initialTeam1Score,
  initialTeam2Score,
  matchFormat,
  onClose,
  onSuccess,
}: Props) {
  const [team1Score, setTeam1Score] = useState<string>(
    initialTeam1Score != null ? String(initialTeam1Score) : ''
  );
  const [team2Score, setTeam2Score] = useState<string>(
    initialTeam2Score != null ? String(initialTeam2Score) : ''
  );
  const [markFinished, setMarkFinished] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { mutateJson } = useIdempotentMutation();
  const { addToast } = useToast();
  const t = useAdminT(nsAdminDashboardScoreEntryModal);

  if (!open) return null;

  const maxWins = matchFormat
    ? FORMAT_MAX_WINS[matchFormat.toLowerCase()]
    : null;

  async function submit() {
    const t1 = Number(team1Score);
    const t2 = Number(team2Score);
    if (!Number.isInteger(t1) || !Number.isInteger(t2) || t1 < 0 || t2 < 0) {
      setError(t.scoresInteger);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // mutateJson injecte l'Idempotency-Key : un retry réseau ne re-propage
      // pas l'avancement du bracket (l'endpoint rejoue la 1ère réponse).
      await mutateJson(matchesPaths.byId(matchId), {
        method: 'PATCH',
        body: JSON.stringify({
          team1Score: t1,
          team2Score: t2,
          status: markFinished ? 'finished' : 'ongoing',
          propagate: true,
        }),
      });
      onSuccess?.();
      onClose();
    } catch (e: unknown) {
      const msg =
        e instanceof BgSyncQueuedError
          ? t.offline
          : ((e as Error)?.message ?? t.unexpectedError);
      setError(msg);
      addToast(msg, e instanceof BgSyncQueuedError ? 'info' : 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-[family-name:var(--fd)] text-lg font-bold text-[var(--t1,#f4edf7)]">
              {t.title}
            </h3>
            <p className="mt-1 text-xs text-[var(--t3,#a39ba6)]">
              {team1Name ?? '—'} vs {team2Name ?? '—'}
              {matchFormat && (
                <span className="ml-2 rounded-[3px] border border-[var(--line2,rgba(194,196,201,.2))] px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                  {matchFormat}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--r-ctrl,4px)] p-1 text-[var(--t3,#a39ba6)] hover:bg-[var(--s2,#1d1520)] hover:text-[var(--t1,#f4edf7)]"
            aria-label={t.closeAria}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--t3,#a39ba6)]">
              {team1Name ?? t.team1Fallback}
            </span>
            <input
              type="number"
              min={0}
              max={maxWins ?? undefined}
              value={team1Score}
              onChange={(e) => setTeam1Score(e.target.value)}
              autoFocus
              className="w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-center font-[family-name:var(--fd)] text-2xl font-extrabold tabular-nums text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--t3,#a39ba6)]">
              {team2Name ?? t.team2Fallback}
            </span>
            <input
              type="number"
              min={0}
              max={maxWins ?? undefined}
              value={team2Score}
              onChange={(e) => setTeam2Score(e.target.value)}
              className="w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-center font-[family-name:var(--fd)] text-2xl font-extrabold tabular-nums text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none"
            />
          </label>
        </div>

        <label className="mb-4 flex items-center gap-2 text-xs text-[var(--t2,#c7bfca)]">
          <input
            type="checkbox"
            checked={markFinished}
            onChange={(e) => setMarkFinished(e.target.checked)}
            className="h-4 w-4 rounded-[3px] border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] accent-[var(--or,#b467d1)]"
          />
          {t.markFinishedBefore}
          <strong>{t.markFinishedStrong}</strong>
          {t.markFinishedAfter}
        </label>

        {error && <p className={`mb-3 p-2 text-xs ${rubanErr}`}>{error}</p>}

        <div className="flex justify-end gap-2">
          <AdminButton
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            {t.cancel}
          </AdminButton>
          <AdminButton
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={submitting || !team1Score || !team2Score}
          >
            {submitting && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-current/30 border-t-current" />
            )}
            {t.save}
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
