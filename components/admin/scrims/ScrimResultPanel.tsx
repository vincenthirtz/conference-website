// components/admin/scrims/ScrimResultPanel.tsx
//
// Section « Résultat » de la fiche admin d'un scrim : le staff saisit ou
// corrige le score final (POST /api/admin/scrims/[scrimId]/result).
//
// Seul moyen de donner un résultat à un scrim contre une équipe extérieure
// (pas de capitaine pour rapporter) et de trancher un litige avec un score.
// Le texte de confirmation dit explicitement ce qu'on écrase : un résultat
// déjà validé (correction) ou un litige (avec sa raison).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { AdminFetchError } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminScrimDetail from '@/lib/i18n/locales/admin-fr/adminScrimDetail';

export type ScrimResultPanelScrim = {
  id: string;
  status: string;
  team1_id: string | null;
  team2_id: string | null;
  team1_score?: number | null;
  team2_score?: number | null;
  winner_team_id?: string | null;
  dispute_reason?: string | null;
  team1?: { name: string } | null;
  team2?: { name: string } | null;
};

type ResultResponse = {
  success: boolean;
  rating_rebuild_advised?: boolean;
};

type Props = {
  scrim: ScrimResultPanelScrim;
  /** Recharge la fiche après écriture (ou après un 409 SCRIM_CHANGED). */
  onSaved: () => void | Promise<void>;
};

const MIN_SCORE = 0;
const MAX_SCORE = 99;

function clampScore(raw: string): number {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return MIN_SCORE;
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, n));
}

export default function ScrimResultPanel({ scrim, onSaved }: Props) {
  const t = useAdminT(nsAdminScrimDetail);
  const { confirm, dialog } = useConfirmDialog();
  const { mutateJson } = useIdempotentMutation();
  const { addToast } = useToast();

  const [score1, setScore1] = useState<number>(scrim.team1_score ?? 0);
  const [score2, setScore2] = useState<number>(scrim.team2_score ?? 0);
  const [submitting, setSubmitting] = useState(false);
  const [rebuildAdvised, setRebuildAdvised] = useState(false);

  // Le scrim rechargé (résultat écrit ici, ou par les capitaines entre-temps)
  // réaligne les champs sur la base.
  useEffect(() => {
    setScore1(scrim.team1_score ?? 0);
    setScore2(scrim.team2_score ?? 0);
  }, [scrim.team1_score, scrim.team2_score]);

  const team1Name = scrim.team1?.name || t.defaultTeam1;
  const team2Name = scrim.team2?.name || t.defaultTeam2;
  const hasScore =
    typeof scrim.team1_score === 'number' &&
    typeof scrim.team2_score === 'number';
  const isCompleted = scrim.status === 'completed';
  const isDisputed = scrim.status === 'disputed';
  const isCancelled = scrim.status === 'cancelled';
  const teamsMissing = !scrim.team1_id || !scrim.team2_id;
  const blocked = isCancelled || teamsMissing;

  const statusLabels: Record<string, string> = {
    draft: t.statusDraft,
    scheduled: t.statusScheduled,
    running: t.statusRunning,
    completed: t.statusCompleted,
    cancelled: t.statusCancelled,
    disputed: t.statusDisputed,
  };

  let winnerLabel: string | null = null;
  if (isCompleted && hasScore) {
    if (!scrim.winner_team_id) winnerLabel = t.resultDraw;
    else if (scrim.winner_team_id === scrim.team1_id)
      winnerLabel = format(t.resultWinner, { team: team1Name });
    else if (scrim.winner_team_id === scrim.team2_id)
      winnerLabel = format(t.resultWinner, { team: team2Name });
  }

  async function submit() {
    if (blocked) return;
    const newScore = `${team1Name} ${score1} – ${score2} ${team2Name}`;
    let subtitle = t.resultConfirmSubtitle;
    if (isCompleted) {
      subtitle = format(t.resultConfirmOverrideSubtitle, {
        previous: hasScore
          ? `${scrim.team1_score} – ${scrim.team2_score}`
          : '—',
        next: `${score1} – ${score2}`,
      });
    } else if (isDisputed) {
      subtitle = format(t.resultConfirmDisputeSubtitle, {
        reason: scrim.dispute_reason || t.resultDisputeNoReason,
      });
    }

    const ok = await confirm({
      title: isCompleted
        ? t.resultConfirmOverrideTitle
        : format(t.resultConfirmTitle, { score: newScore }),
      subtitle,
      variant: isCompleted || isDisputed ? 'warning' : 'info',
      confirmLabel: t.resultConfirmLabel,
    });
    if (!ok) return;

    setSubmitting(true);
    setRebuildAdvised(false);
    try {
      const res = await mutateJson<ResultResponse>(
        `/api/admin/scrims/${scrim.id}/result`,
        {
          method: 'POST',
          body: JSON.stringify({ team1_score: score1, team2_score: score2 }),
        }
      );
      addToast(t.resultSaved, 'success');
      if (res?.rating_rebuild_advised) {
        setRebuildAdvised(true);
        addToast(t.resultRebuildHint, 'warning', 8000);
      }
      await onSaved();
    } catch (err) {
      const code =
        err instanceof AdminFetchError &&
        err.payload &&
        typeof err.payload === 'object' &&
        'code' in err.payload
          ? String((err.payload as { code: unknown }).code)
          : null;
      if (code === 'SCRIM_CHANGED') {
        addToast(t.resultErrorChanged, 'error');
        await onSaved();
      } else {
        addToast((err as Error)?.message || t.resultError, 'error');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="bg-neutral-800/50 border border-neutral-700/50 rounded-2xl p-6 space-y-4">
      {dialog}
      <h2 className="text-lg font-semibold">{t.resultHeading}</h2>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="px-2 py-0.5 rounded-md text-xs bg-neutral-700">
          {statusLabels[scrim.status] ?? scrim.status}
        </span>
        {hasScore ? (
          <span className="font-medium">
            {format(t.resultCurrent, {
              team1: team1Name,
              score1: String(scrim.team1_score),
              score2: String(scrim.team2_score),
              team2: team2Name,
            })}
          </span>
        ) : (
          <span className="text-neutral-400">{t.resultNone}</span>
        )}
        {winnerLabel && <span className="text-emerald-400">{winnerLabel}</span>}
      </div>

      {isDisputed && (
        <div className="rounded-lg bg-amber-900/30 border border-amber-500/40 px-3 py-2 text-sm">
          {format(t.resultDisputeNotice, {
            reason: scrim.dispute_reason || t.resultDisputeNoReason,
          })}
        </div>
      )}
      {isCompleted && (
        <p className="text-xs text-neutral-400">{t.resultCompletedNotice}</p>
      )}
      {isCancelled && (
        <p className="text-xs text-amber-300">{t.resultCancelledNotice}</p>
      )}
      {!isCancelled && teamsMissing && (
        <p className="text-xs text-amber-300">{t.resultTeamsMissing}</p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="scrim-result-team1"
            className="block text-sm text-neutral-400 mb-1"
          >
            {format(t.resultScoreFor, { team: team1Name })}
          </label>
          <input
            id="scrim-result-team1"
            type="number"
            inputMode="numeric"
            min={MIN_SCORE}
            max={MAX_SCORE}
            step={1}
            value={score1}
            disabled={blocked || submitting}
            onChange={(e) => setScore1(clampScore(e.target.value))}
            className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600 disabled:opacity-50"
          />
        </div>
        <div>
          <label
            htmlFor="scrim-result-team2"
            className="block text-sm text-neutral-400 mb-1"
          >
            {format(t.resultScoreFor, { team: team2Name })}
          </label>
          <input
            id="scrim-result-team2"
            type="number"
            inputMode="numeric"
            min={MIN_SCORE}
            max={MAX_SCORE}
            step={1}
            value={score2}
            disabled={blocked || submitting}
            onChange={(e) => setScore2(clampScore(e.target.value))}
            className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-600 disabled:opacity-50"
          />
        </div>
      </div>

      {rebuildAdvised && (
        <p className="text-xs text-amber-300">
          {t.resultRebuildHint}{' '}
          <Link href="/admin/ratings" className="text-blue-400 hover:underline">
            {t.resultRebuildLink}
          </Link>
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={submit}
          disabled={blocked || submitting}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium"
        >
          {submitting ? t.resultSubmitting : t.resultSubmit}
        </button>
      </div>
    </section>
  );
}
