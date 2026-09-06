// hooks/useAutoSchedule.tsx
//
// Le flux complet de l'auto-scheduler d'un tournoi : SIMULER, faire relire,
// puis écrire. Extrait de `pages/admin/tournament/[id]/matches.tsx` (lot 6 de
// docs/PLAN-plateforme-tournois.md, sous la règle A7 : tout lot qui touche un
// god-component en sort un morceau).
//
// Trois échanges avec le serveur, dans cet ordre, et c'est l'ordre qui compte :
//
//   1. `dryRun: true` — le planning est calculé et rendu SANS RIEN ÉCRIRE.
//      L'auto-scheduler ne propose pas, il déplace de vrais matchs ; sur une
//      grille saturée, l'appliquer avant de l'avoir lu déplace des affiches que
//      personne n'a décidé de déplacer.
//   2. l'écriture, une fois la simulation confirmée ;
//   3. si le serveur refuse en 409 pour cause de conflits, une seconde
//      confirmation explicite avant de renvoyer `acceptConflicts: true`.
//
// Le hook ne sait rien du rendu : il reçoit ses libellés et rend un état + une
// action. Le dialogue de confirmation et les toasts viennent de l'appelant.

import { useCallback, useState } from 'react';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { format } from '@/lib/i18n/useAdminT';

type MutateIdempotent = (
  input: string,
  init?: { method?: string; body?: string }
) => Promise<Response>;

export type AutoScheduleLabels = {
  autoSimTitle: string;
  autoSimSubtitle: string;
  autoSimUnscheduled: string;
  autoSimConstraints: string;
  autoSimNoConstraints: string;
  autoSimNothing: string;
  autoConflictsTitle: string;
  autoConflictsSubtitle: string;
  autoConflictsAccepted: string;
  autoApply: string;
  autoDoneMsg: string;
  errorAutoSchedule: string;
};

type Options = {
  tournamentId: string | undefined;
  mutateIdempotent: MutateIdempotent;
  confirm: ReturnType<typeof useConfirmDialog>['confirm'];
  addToast: (message: string, kind: 'success' | 'error' | 'info') => void;
  onError: (message: string | null) => void;
  onDone: () => void;
  labels: AutoScheduleLabels;
};

export function useAutoSchedule({
  tournamentId,
  mutateIdempotent,
  confirm,
  addToast,
  onError,
  onDone,
  labels: t,
}: Options) {
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    if (!tournamentId) return;
    setRunning(true);
    onError(null);

    const url = `/api/admin/tournament/${tournamentId}/auto-schedule`;
    const callAutoSchedule = (acceptConflicts: boolean) =>
      mutateIdempotent(url, {
        method: 'POST',
        body: JSON.stringify(acceptConflicts ? { acceptConflicts: true } : {}),
      });

    try {
      const simRes = await mutateIdempotent(url, {
        method: 'POST',
        body: JSON.stringify({ dryRun: true }),
      });
      if (!simRes.ok) {
        const json = await simRes.json().catch(() => ({}));
        throw new Error(json.error || t.errorAutoSchedule);
      }
      const sim = await simRes.json();
      const simCount: number = sim.scheduled?.length ?? 0;
      const simUnscheduled: number = sim.unscheduledMatchIds?.length ?? 0;
      const simConstraints: number = sim.constraintCount ?? 0;

      if (simCount === 0 && simUnscheduled === 0) {
        addToast(t.autoSimNothing, 'info');
        return;
      }

      const goAhead = await confirm({
        title: format(t.autoSimTitle, { count: simCount }),
        subtitle: t.autoSimSubtitle,
        body: (
          <span className="block space-y-1 text-sm">
            {simUnscheduled > 0 && (
              <span className="block text-amber-300">
                {format(t.autoSimUnscheduled, { count: simUnscheduled })}
              </span>
            )}
            <span className="block text-neutral-400">
              {simConstraints > 0
                ? format(t.autoSimConstraints, { count: simConstraints })
                : t.autoSimNoConstraints}
            </span>
          </span>
        ),
        confirmLabel: t.autoApply,
      });
      if (!goAhead) return;

      let res = await callAutoSchedule(false);

      // Le back refuse d'appliquer si des conflits ont été détectés : on
      // demande une confirmation explicite avant de renvoyer la requête.
      if (res.status === 409) {
        const json = await res.json().catch(() => ({}));
        if (json.detail === 'SCHEDULE_CONFLICTS_REQUIRE_CONFIRMATION') {
          const count = json.conflicts?.length ?? 0;
          const ok = await confirm({
            title: format(t.autoConflictsTitle, { count }),
            subtitle: t.autoConflictsSubtitle,
            variant: 'warning',
            confirmLabel: t.autoApply,
          });
          if (!ok) return;
          res = await callAutoSchedule(true);
        }
      }

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errorAutoSchedule);
      }

      const json = await res.json();
      const scheduledCount =
        json.scheduled?.length ?? json.scheduledMatchesCount ?? 0;
      const conflictCount = json.conflicts?.length ?? 0;
      const warnings: string[] = json.warnings ?? [];

      let toastMsg = format(t.autoDoneMsg, { count: scheduledCount });
      if (conflictCount > 0) {
        toastMsg += ' ' + format(t.autoConflictsAccepted, { count: conflictCount });
      }
      if (warnings.length > 0) toastMsg += ` ${warnings.join(' ')}`;

      addToast(toastMsg, conflictCount > 0 ? 'info' : 'success');
      onDone();
    } catch (err: unknown) {
      onError((err as Error)?.message ?? t.errorAutoSchedule);
    } finally {
      setRunning(false);
    }
  }, [tournamentId, mutateIdempotent, confirm, addToast, onError, onDone, t]);

  return { running, run };
}
