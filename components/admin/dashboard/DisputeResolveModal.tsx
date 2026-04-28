// components/admin/dashboard/DisputeResolveModal.tsx
// Modale pour résoudre une dispute ouverte sans quitter le dashboard.
// Appelle PATCH /api/admin/matches/[matchId]/dispute.
//
// Deux modes :
//  - "Résoudre sans changer le score" : { resolution, resumeStatus: 'finished' | 'pending' | 'ongoing' }
//  - "Résoudre avec score corrigé" : { resolution, team1Score, team2Score, resumeStatus: 'finished' }

import { useState } from 'react';

type Props = {
  open: boolean;
  matchId: string;
  team1Name: string | null;
  team2Name: string | null;
  reason: string | null;
  initialTeam1Score?: number | null;
  initialTeam2Score?: number | null;
  onClose: () => void;
  onSuccess?: () => void;
};

type Mode = 'no_change' | 'override_score';

export default function DisputeResolveModal({
  open,
  matchId,
  team1Name,
  team2Name,
  reason,
  initialTeam1Score,
  initialTeam2Score,
  onClose,
  onSuccess,
}: Props) {
  const [mode, setMode] = useState<Mode>('no_change');
  const [resolution, setResolution] = useState('');
  const [team1Score, setTeam1Score] = useState<string>(
    initialTeam1Score != null ? String(initialTeam1Score) : ''
  );
  const [team2Score, setTeam2Score] = useState<string>(
    initialTeam2Score != null ? String(initialTeam2Score) : ''
  );
  const [resumeStatus, setResumeStatus] = useState<
    'pending' | 'ongoing' | 'finished'
  >('finished');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit() {
    if (resolution.trim().length === 0) {
      setError('La résolution est requise.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        resolution: resolution.trim(),
        resumeStatus,
      };
      if (mode === 'override_score') {
        const t1 = Number(team1Score);
        const t2 = Number(team2Score);
        if (
          !Number.isInteger(t1) ||
          !Number.isInteger(t2) ||
          t1 < 0 ||
          t2 < 0
        ) {
          throw new Error('Les deux scores doivent être des entiers ≥ 0.');
        }
        body.team1Score = t1;
        body.team2Score = t2;
      }
      const res = await fetch(`/api/admin/matches/${matchId}/dispute`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Échec de la résolution');
      }
      onSuccess?.();
      onClose();
    } catch (e: unknown) {
      setError((e as Error)?.message ?? 'Erreur inattendue');
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
        className="w-full max-w-lg rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">
              Résoudre la dispute
            </h3>
            <p className="mt-1 text-xs text-neutral-400">
              {team1Name ?? '—'} vs {team2Name ?? '—'}
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

        {reason && (
          <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="text-[10px] uppercase tracking-wider text-amber-400">
              Raison de la dispute
            </p>
            <p className="mt-1 whitespace-pre-wrap text-xs text-amber-100">
              {reason}
            </p>
          </div>
        )}

        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode('no_change')}
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              mode === 'no_change'
                ? 'border-blue-500 bg-blue-500/10 text-blue-200'
                : 'border-neutral-700 text-neutral-400 hover:bg-neutral-800'
            }`}
          >
            Sans changer le score
          </button>
          <button
            type="button"
            onClick={() => setMode('override_score')}
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              mode === 'override_score'
                ? 'border-purple-500 bg-purple-500/10 text-purple-200'
                : 'border-neutral-700 text-neutral-400 hover:bg-neutral-800'
            }`}
          >
            Avec score corrigé
          </button>
        </div>

        {mode === 'override_score' && (
          <div className="mb-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-400">
                {team1Name ?? 'Équipe 1'}
              </span>
              <input
                type="number"
                min={0}
                value={team1Score}
                onChange={(e) => setTeam1Score(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-center text-xl font-bold text-white tabular-nums focus:border-purple-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-400">
                {team2Name ?? 'Équipe 2'}
              </span>
              <input
                type="number"
                min={0}
                value={team2Score}
                onChange={(e) => setTeam2Score(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-center text-xl font-bold text-white tabular-nums focus:border-purple-500 focus:outline-none"
              />
            </label>
          </div>
        )}

        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-neutral-400">
            Résolution (visible dans l&apos;historique)
          </span>
          <textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            rows={4}
            placeholder="Ex : après vérification du replay, le score initial était correct."
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-neutral-400">
            Statut de reprise
          </span>
          <select
            value={resumeStatus}
            onChange={(e) =>
              setResumeStatus(
                e.target.value as 'pending' | 'ongoing' | 'finished'
              )
            }
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
          >
            <option value="finished">Terminé (finished)</option>
            <option value="ongoing">En cours (ongoing)</option>
            <option value="pending">En attente (pending)</option>
          </select>
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
            disabled={submitting || resolution.trim().length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            )}
            Résoudre
          </button>
        </div>
      </div>
    </div>
  );
}
