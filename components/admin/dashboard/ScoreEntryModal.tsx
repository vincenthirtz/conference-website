// components/admin/dashboard/ScoreEntryModal.tsx
// Modale légère pour saisir le score d'un match sans quitter le dashboard.
// Appelle PATCH /api/admin/matches/[matchId] avec { team1Score, team2Score, status }.

import { useState } from 'react';
import {
  useIdempotentMutation,
  BgSyncQueuedError,
} from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';

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

  if (!open) return null;

  const maxWins = matchFormat
    ? FORMAT_MAX_WINS[matchFormat.toLowerCase()]
    : null;

  async function submit() {
    const t1 = Number(team1Score);
    const t2 = Number(team2Score);
    if (!Number.isInteger(t1) || !Number.isInteger(t2) || t1 < 0 || t2 < 0) {
      setError('Les deux scores doivent être des entiers ≥ 0.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // mutateJson injecte l'Idempotency-Key : un retry réseau ne re-propage
      // pas l'avancement du bracket (l'endpoint rejoue la 1ère réponse).
      await mutateJson(`/api/admin/matches/${matchId}`, {
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
          ? 'Hors-ligne : la saisie sera envoyée à la reconnexion.'
          : ((e as Error)?.message ?? 'Erreur inattendue');
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
        className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">
              Saisir le score
            </h3>
            <p className="mt-1 text-xs text-neutral-400">
              {team1Name ?? '—'} vs {team2Name ?? '—'}
              {matchFormat && (
                <span className="ml-2 rounded-md bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                  {matchFormat}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            aria-label="Fermer"
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
            <span className="mb-1 block text-xs font-medium text-neutral-400">
              {team1Name ?? 'Équipe 1'}
            </span>
            <input
              type="number"
              min={0}
              max={maxWins ?? undefined}
              value={team1Score}
              onChange={(e) => setTeam1Score(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-center text-2xl font-bold text-white tabular-nums focus:border-purple-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-400">
              {team2Name ?? 'Équipe 2'}
            </span>
            <input
              type="number"
              min={0}
              max={maxWins ?? undefined}
              value={team2Score}
              onChange={(e) => setTeam2Score(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-center text-2xl font-bold text-white tabular-nums focus:border-purple-500 focus:outline-none"
            />
          </label>
        </div>

        <label className="mb-4 flex items-center gap-2 text-xs text-neutral-300">
          <input
            type="checkbox"
            checked={markFinished}
            onChange={(e) => setMarkFinished(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-600 bg-neutral-800"
          />
          Marquer le match comme <strong>terminé</strong> et propager le bracket
        </label>

        {error && (
          <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700"
            disabled={submitting}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !team1Score || !team2Score}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            )}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
