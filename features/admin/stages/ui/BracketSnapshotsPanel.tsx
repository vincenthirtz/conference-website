// features/admin/stages/ui/BracketSnapshotsPanel.tsx — snapshots de bracket
// d'une phase (`/api/admin/stages/[stageId]/snapshots`) : liste, snapshot
// manuel, restauration.
//
// La restauration écrase les scores saisis depuis : confirmation « danger »
// obligatoire, et bouton grisé sous le rôle admin (le serveur refuse de toute
// façon — le grisé n'est que de l'UX, la garde reste côté route).

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/Toast';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { format } from '@/lib/i18n/useAdminT';
import type nsAdminStageHistory from '@/lib/i18n/locales/admin-fr/adminStageHistory';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import { type BracketSnapshot, stageUrls } from '../client';
import { useStageRead } from '../hooks/useStage';
import { stageKeys } from '../hooks/keys';
import { ERROR_BOX, INPUT, LABEL, MUTED, SPINNER } from './rubanClasses';

type Dict = typeof nsAdminStageHistory.fr;

type Props = {
  stageId: string;
  /** Rôle admin et plus : seul habilité à restaurer. */
  canRestore: boolean;
  t: Dict;
};

/** Motif technique → libellé ; un motif libre (snapshot manuel) reste tel quel. */
export function snapshotReasonLabel(reason: string | null, t: Dict): string {
  switch (reason) {
    case null:
    case '':
    case 'manual':
      return t.snapReasonManual;
    case 'pre_restore':
      return t.snapReasonPreRestore;
    case 'apply_score':
      return t.snapReasonApplyScore;
    case 'auto_seed':
      return t.snapReasonAutoSeed;
    case 'manual_seed':
      return t.snapReasonManualSeed;
    case 'advance_teams':
      return t.snapReasonAdvance;
    case 'bracket_propagation':
      return t.snapReasonPropagation;
    default:
      return reason;
  }
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

async function errorOf(res: Response, fallback: string) {
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  return json.error || fallback;
}

export default function BracketSnapshotsPanel({
  stageId,
  canRestore,
  t,
}: Props) {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const { mutate: createMutate } = useIdempotentMutation();
  const { mutate: restoreMutate } = useIdempotentMutation();

  const query = useStageRead<{ snapshots?: BracketSnapshot[] }>(
    stageId,
    'snapshots',
    stageUrls.snapshots
  );
  const snapshots = query.data?.snapshots ?? [];

  const [reason, setReason] = useState('');
  const [taking, setTaking] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const handleTake = useCallback(async () => {
    setTaking(true);
    try {
      const res = await createMutate(stageUrls.snapshots(stageId), {
        method: 'POST',
        body: JSON.stringify(reason.trim() ? { reason: reason.trim() } : {}),
      });
      if (!res.ok) throw new Error(await errorOf(res, t.snapErrTake));
      const json = (await res.json()) as { matchCount?: number };
      addToast(format(t.snapTaken, { count: json.matchCount ?? 0 }), 'success');
      setReason('');
      await query.refetch();
    } catch (err) {
      addToast((err as Error)?.message || t.snapErrTake, 'error');
    } finally {
      setTaking(false);
    }
  }, [createMutate, stageId, reason, addToast, t, query]);

  const handleRestore = useCallback(
    async (snap: BracketSnapshot) => {
      const ok = await confirm({
        title: t.snapRestoreTitle,
        subtitle: format(t.snapRestoreSubtitle, {
          date: formatDateTime(snap.taken_at),
        }),
        variant: 'danger',
        confirmLabel: t.snapRestoreConfirm,
      });
      if (!ok) return;
      setRestoringId(snap.id);
      try {
        const res = await restoreMutate(stageUrls.snapshots(stageId), {
          method: 'PATCH',
          body: JSON.stringify({ snapshotId: snap.id }),
        });
        if (!res.ok) throw new Error(await errorOf(res, t.snapErrRestore));
        const json = (await res.json()) as {
          restored?: number;
          missing?: number;
        };
        addToast(
          format(t.snapRestored, {
            restored: json.restored ?? 0,
            missing: json.missing ?? 0,
          }),
          'success'
        );
        // Tout ce qui dépend des matchs de la phase (journal, classement…).
        await qc.invalidateQueries({ queryKey: stageKeys.one(stageId) });
      } catch (err) {
        addToast((err as Error)?.message || t.snapErrRestore, 'error');
      } finally {
        setRestoringId(null);
      }
    },
    [confirm, restoreMutate, stageId, addToast, t, qc]
  );

  const errorMsg = query.error ? query.error.message || t.snapErrLoad : null;

  return (
    <section
      data-testid="bracket-snapshots"
      className="overflow-hidden rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]"
    >
      {dialog}
      <div className="space-y-3 border-b border-[var(--line,rgba(194,196,201,.12))] px-5 py-4">
        <h2 className="text-sm font-semibold text-[var(--t1,#f4edf7)]">
          {t.snapHeading}
        </h2>
        <p className={`text-xs ${MUTED}`}>{t.snapIntro}</p>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleTake();
          }}
        >
          <div className="flex min-w-[240px] flex-1 flex-col gap-1">
            <label htmlFor="snapshot-reason" className={LABEL}>
              {t.snapReasonLabel}
            </label>
            <input
              id="snapshot-reason"
              type="text"
              maxLength={200}
              className={INPUT}
              placeholder={t.snapReasonPlaceholder}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <AdminButton
            type="submit"
            variant="primary"
            size="sm"
            disabled={taking}
          >
            {taking ? t.snapTaking : t.snapTake}
          </AdminButton>
        </form>
      </div>

      {errorMsg && <div className={`m-4 ${ERROR_BOX}`}>{errorMsg}</div>}

      {query.isPending && (
        <div className="flex items-center justify-center py-10">
          <div className={SPINNER} />
        </div>
      )}

      {!query.isPending && !errorMsg && snapshots.length === 0 && (
        <div className="px-5 py-8 text-center text-sm text-[var(--t3,#a39ba6)]">
          {t.snapEmpty}
        </div>
      )}

      {snapshots.length > 0 && (
        <>
          <div className="px-5 pt-3 text-xs text-[var(--t3,#a39ba6)]">
            {format(t.snapCount, { count: snapshots.length })}
          </div>
          <ul className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
            {snapshots.map((snap) => (
              <li
                key={snap.id}
                data-testid="bracket-snapshot-row"
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-[var(--t4,#807984)]">
                    {formatDateTime(snap.taken_at)}
                  </span>
                  <Chip tone={snap.reason === 'pre_restore' ? 'warn' : 'brand'}>
                    {snapshotReasonLabel(snap.reason, t)}
                  </Chip>
                  <Chip>
                    {format(t.snapMatches, { count: snap.match_count ?? 0 })}
                  </Chip>
                  {snap.staff && (
                    <span className="text-xs text-[var(--t3,#a39ba6)]">
                      {t.by}{' '}
                      <span className="font-medium text-[var(--t1,#f4edf7)]">
                        {snap.staff.display_name || snap.staff.id}
                      </span>
                    </span>
                  )}
                </div>
                <AdminButton
                  variant="danger"
                  size="xs"
                  disabled={!canRestore || restoringId !== null}
                  title={canRestore ? undefined : t.snapRestoreAdminOnly}
                  onClick={() => void handleRestore(snap)}
                >
                  {t.snapRestore}
                </AdminButton>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
