// components/admin/tcg/TcgBattlenetBackfillCard.tsx
//
// Rattraper la récompense « compte Battle.net vérifié » pour les comptes liés
// avant qu'elle existe : simuler, confirmer, distribuer.
//
// MÊME PATRON QUE `TcgWelcomeGiftCard` : le nombre est annoncé AVANT de laisser
// cliquer, et la confirmation le répète avec le montant et le total — on ne
// valide pas une intention vague. Elle dit aussi combien de DM Discord vont
// partir : chaque crédit en déclenche un, et ce n'est pas un détail pour qui
// reçoit une notification à 23 h.
//
// LE BOUTON NE SE RÉARME PAS TOUT SEUL (`autoRegenerateOnSuccess: false`) : un
// second clic rejoue la réponse au lieu de relancer la distribution.
//
// LE RÉSULTAT RESTE AFFICHÉ dans une région `aria-live` toujours montée : un
// toast disparaît, un rattrapage partiel (des échecs) doit se lire et se
// reprendre.
//
// LES LIBELLÉS VIENNENT DE `useAdminT` (namespace dédié), comme la carte
// d'ajustement de solde. Les valeurs arrivent de l'API : la carte ne connaît
// aucun montant.

import { useCallback, useEffect, useState } from 'react';

import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import WidgetCard from '@/components/admin/dashboard/WidgetCard';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTcgBattlenetBackfill from '@/lib/i18n/locales/admin-fr/adminTcgBattlenetBackfill';
import {
  type BackfillReport,
  type BackfillSimulation,
  backfillOutcome,
  canDistribute,
  confirmFigures,
  normalizeBackfillReport,
  normalizeBackfillSimulation,
} from '../../../utils/tcg/battlenetBackfillModel';
import { logger } from '../../../utils/logger';

const ROUTE = '/api/admin/tcg/battlenet-backfill';

type Result =
  | { kind: 'report'; report: BackfillReport }
  | { kind: 'error'; message: string };

export default function TcgBattlenetBackfillCard() {
  const t = useAdminT(nsAdminTcgBattlenetBackfill);
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation({
    autoRegenerateOnSuccess: false,
  });
  const { confirm, dialog } = useConfirmDialog();

  const [sim, setSim] = useState<BackfillSimulation | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const next = normalizeBackfillSimulation(await adminFetchJson(ROUTE));
      setSim(next);
      // Une forme inattendue est un échec de lecture, pas « rien à faire ».
      if (!next) setLoadFailed(true);
    } catch (err) {
      logger.error('[admin/tcg/battlenet-backfill] load error:', err);
      setSim(null);
      setLoadFailed(true);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    void load();
  }, [load]);

  const onGrant = async () => {
    if (!sim || !canDistribute(sim)) return;
    const figures = confirmFigures(sim);
    const ok = await confirm({
      title: t.confirmTitle,
      subtitle: `${format(t.confirmBody, {
        count: figures.count,
        coins: figures.coins,
        total: figures.total,
      })} ${
        figures.dms === null
          ? t.confirmDmsUnknown
          : format(t.confirmDms, { dms: figures.dms })
      }`,
      confirmLabel: t.grant,
    });
    if (!ok) return;

    setBusy(true);
    try {
      const report = normalizeBackfillReport(
        await mutateJson(ROUTE, { method: 'POST' })
      );
      setResult(
        report
          ? { kind: 'report', report }
          : { kind: 'error', message: t.grantError }
      );
      // La simulation est relue : les compteurs affichés doivent décrire
      // l'état APRÈS la distribution, pas avant.
      await load();
    } catch (err) {
      logger.error('[admin/tcg/battlenet-backfill] grant error:', err);
      setResult({
        kind: 'error',
        message: (err as Error)?.message || t.grantError,
      });
    } finally {
      setBusy(false);
    }
  };

  const outcome =
    result?.kind === 'report' ? backfillOutcome(result.report) : null;
  // Seuls les compteurs s'interpolent : `reward` est un objet.
  const counts: Record<string, number> =
    result?.kind === 'report'
      ? {
          granted: result.report.granted,
          already: result.report.already,
          errors: result.report.errors,
        }
      : {};
  const resultText =
    result === null
      ? ''
      : result.kind === 'error'
        ? result.message
        : outcome === 'partial'
          ? format(t.resultPartial, counts)
          : outcome === 'granted'
            ? format(t.resultGranted, counts)
            : format(t.resultNothing, counts);
  const resultClass =
    result === null
      ? ''
      : result.kind === 'error'
        ? 'mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200'
        : outcome === 'partial'
          ? 'mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200'
          : 'mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200';

  return (
    <>
      <WidgetCard title={t.heading}>
        <p className="mb-4 max-w-prose text-xs text-gray-400">{t.subtitle}</p>

        {loadFailed && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200"
          >
            {t.loadError}
          </div>
        )}

        {!sim && !loadFailed && <LoadingSpinner size="sm" className="py-4" />}

        {sim && (
          <div className="space-y-3">
            <ul className="space-y-1 text-sm text-gray-300">
              <li>{format(t.eligible, { count: sim.eligible })}</li>
              <li>
                {format(t.alreadyRewarded, { count: sim.alreadyRewarded })}
              </li>
              <li>{format(t.wouldGrant, { count: sim.wouldGrant })}</li>
              <li className="text-gray-400">
                {sim.discordDms === null
                  ? t.discordDmsUnknown
                  : format(t.discordDms, { count: sim.discordDms })}
              </li>
              <li className="text-gray-400">
                {format(t.outsideSpace, { count: sim.outsideSpace })}
              </li>
              <li className="text-gray-400">
                {format(t.reward, { coins: sim.reward.coins })}
              </li>
            </ul>

            {!sim.ready && (
              <p className="text-xs text-amber-200">{t.notReady}</p>
            )}

            <p className="text-[11px] text-gray-500">{t.replayHint}</p>

            <div className="flex flex-wrap items-center justify-end gap-3">
              {sim.ready && sim.wouldGrant === 0 && (
                <span className="text-xs text-gray-500">{t.nothingToDo}</span>
              )}
              <button
                type="button"
                onClick={() => void onGrant()}
                disabled={busy || !canDistribute(sim)}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 disabled:opacity-50"
              >
                {busy ? t.granting : t.grant}
              </button>
            </div>
          </div>
        )}

        {/* Région live TOUJOURS montée : elle doit exister avant de se remplir
            pour que le résultat soit annoncé. */}
        <div role="status" aria-live="polite" className={resultClass}>
          {resultText}
        </div>
      </WidgetCard>
      {dialog}
    </>
  );
}
