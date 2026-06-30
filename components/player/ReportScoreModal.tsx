// components/player/ReportScoreModal.tsx
// Modale "Rapporter le score" pour l'espace capitaine. Saisie en perspective
// "Mon équipe" / "Adversaire", convertie en team1Score/team2Score (perspective
// ABSOLUE du match) selon le `slot` de l'équipe du capitaine avant l'appel à
// POST /api/player/matches/{matchId}/report-score.
//
// Gère les 3 issues (awaiting_opponent / finalized / disputed) et les erreurs
// (400 / 403 / 409 MATCH_FINALIZED / 429) via le système de toast partagé. Le
// report soumis est remonté au parent (idempotence : re-soumission supportée).

import { useEffect, useState } from 'react';
import Modal from '@/components/admin/Modal';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useT, format } from '@/lib/i18n/useT';

export type ReportOutcome = 'awaiting_opponent' | 'finalized' | 'disputed';

/** Report local du capitaine, en perspective "mon équipe / adversaire". */
export type LocalReport = {
  mine: number;
  opponent: number;
};

type T = ReturnType<typeof useT<'playerMatches'>>;

type ReportScoreResponse =
  | { status: 'awaiting_opponent'; matchId: string }
  | { status: 'finalized'; matchId: string }
  | { status: 'disputed'; matchId: string };

type Props = {
  open: boolean;
  onClose: () => void;
  matchId: string;
  /** Slot de l'équipe du capitaine dans le match (1 = team1, 2 = team2). */
  slot: 1 | 2;
  opponentName: string;
  myTeamName: string;
  bestOf: number | null;
  /** Report déjà soumis localement (pour pré-remplir / corriger). */
  currentReport: LocalReport | null;
  t: T;
  /**
   * Remonté au parent après une soumission réussie : l'issue serveur et le
   * report local courant (perspective mon équipe / adversaire).
   */
  onReported: (outcome: ReportOutcome, report: LocalReport) => void;
};

function clampScore(raw: string): number {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return 0;
  return n;
}

export default function ReportScoreModal({
  open,
  onClose,
  matchId,
  slot,
  opponentName,
  myTeamName,
  bestOf,
  currentReport,
  t,
  onReported,
}: Props) {
  const { adminFetch } = useAdminFetch({ loginPath: '/login' });
  const { addToast } = useToast();
  const [mine, setMine] = useState<string>('');
  const [opponent, setOpponent] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // (Ré)initialise les champs à l'ouverture depuis le report courant.
  useEffect(() => {
    if (!open) return;
    setMine(currentReport ? String(currentReport.mine) : '');
    setOpponent(currentReport ? String(currentReport.opponent) : '');
  }, [open, currentReport]);

  const max = bestOf ?? undefined;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const mineScore = clampScore(mine);
    const oppScore = clampScore(opponent);

    // Conversion perspective "mon équipe / adversaire" -> team1/team2 ABSOLU.
    const team1Score = slot === 1 ? mineScore : oppScore;
    const team2Score = slot === 1 ? oppScore : mineScore;

    setSubmitting(true);
    try {
      const res = await adminFetch(
        `/api/player/matches/${encodeURIComponent(matchId)}/report-score`,
        {
          method: 'POST',
          body: JSON.stringify({ team1Score, team2Score }),
          skipAuthRedirect: true,
        }
      );

      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }

      if (!res.ok) {
        const code =
          payload && typeof payload === 'object' && 'code' in payload
            ? String((payload as { code: unknown }).code)
            : null;
        if (res.status === 403) {
          addToast(t.errNotCaptain, 'error');
        } else if (res.status === 409 || code === 'MATCH_FINALIZED') {
          addToast(t.errFinalized, 'error');
        } else if (res.status === 429) {
          addToast(t.errRateLimited, 'warning');
        } else if (res.status === 400) {
          addToast(t.errInvalidScore, 'error');
        } else {
          addToast(t.errGeneric, 'error');
        }
        return;
      }

      const data = payload as ReportScoreResponse;
      const localReport: LocalReport = { mine: mineScore, opponent: oppScore };

      if (data.status === 'finalized') {
        addToast(t.statusFinalized, 'success');
      } else if (data.status === 'disputed') {
        addToast(t.statusDisputed, 'warning', 6000);
      } else {
        addToast(t.statusAwaiting, 'info');
      }

      onReported(data.status, localReport);
      onClose();
    } catch (err) {
      if (err instanceof AdminFetchError && err.status === 401) {
        // useAdminFetch a déjà géré la redirection si nécessaire.
        return;
      }
      addToast(t.errGeneric, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      title={t.reportScoreTitle}
      subtitle={t.reportScoreIntro}
      size="sm"
      disableBackdropClose={submitting}
      disableEscapeClose={submitting}
      panelChromeClassName="bg-[#0c0c12] border border-white/10 rounded-2xl shadow-2xl text-white"
      dataTestId="report-score-modal"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {bestOf != null && (
          <p className="text-xs uppercase tracking-wide text-purple-200/70">
            {format(t.bestOfHint, { bestOf })}
          </p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="report-mine"
              className="block text-sm font-medium text-white"
            >
              {t.myTeamLabel}
            </label>
            <p
              className="mt-0.5 text-xs text-gray-400 truncate"
              title={myTeamName}
            >
              {myTeamName}
            </p>
            <input
              id="report-mine"
              type="number"
              inputMode="numeric"
              min={0}
              max={max}
              required
              value={mine}
              onChange={(e) => setMine(e.target.value)}
              aria-label={t.myTeamScore}
              className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-center text-2xl font-bold tabular-nums text-white outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-400/40"
            />
          </div>

          <div>
            <label
              htmlFor="report-opponent"
              className="block text-sm font-medium text-white"
            >
              {t.opponentLabel}
            </label>
            <p
              className="mt-0.5 text-xs text-gray-400 truncate"
              title={opponentName}
            >
              {opponentName}
            </p>
            <input
              id="report-opponent"
              type="number"
              inputMode="numeric"
              min={0}
              max={max}
              required
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              aria-label={t.opponentScore}
              className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-center text-2xl font-bold tabular-nums text-white outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-400/40"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-50"
          >
            {t.cancel}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-gradient-to-r from-pink-500 to-purple-500 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-purple-500/20 transition hover:brightness-110 disabled:opacity-60"
          >
            {submitting
              ? t.submitting
              : currentReport
                ? t.updateReport
                : t.submitReport}
          </button>
        </div>
      </form>
    </Modal>
  );
}
