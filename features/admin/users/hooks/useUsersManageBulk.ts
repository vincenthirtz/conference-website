// features/admin/users/hooks/useUsersManageBulk.ts — les actions en lot et
// l'export CSV de la gestion des inscrits (pages/admin/users/manage.tsx).
//
// Sortis TELS QUELS de la page (gelée en taille, règle A7) : mêmes corps, mêmes
// confirmations, mêmes appels et payloads. Aucun état n'est créé ici : la page
// garde `selectedRows`, `bulkBusy`, `bulkProgress`, `exporting` et passe leurs
// setters, avec tout ce dont les handlers dépendaient dans sa closure.

import type { Dispatch, SetStateAction } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { filenameFromContentDisposition } from '@/utils/teams/teamExportClient';
import { buildUsersExportUrl, usersClient } from '../client';
import type { useConfirmDialog } from '@/hooks/useConfirmDialog';
import type { useToast } from '@/components/Toast';
import {
  canGrantRole,
  isRowLocked,
  type Dict,
  type QuickFilter,
  type SortDir,
  type SortField,
  type StaffShape,
  type UserLite,
} from '@/features/admin/users/manageModel';

type Deps = {
  t: Dict;
  staff: StaffShape;
  selfId: string;
  selectedRows: Map<string, UserLite>;
  setSelectedRows: Dispatch<SetStateAction<Map<string, UserLite>>>;
  setBulkBusy: Dispatch<SetStateAction<boolean>>;
  setBulkProgress: Dispatch<
    SetStateAction<{ done: number; total: number } | null>
  >;
  setExporting: Dispatch<SetStateAction<boolean>>;
  search: string;
  roleFilter: string | null;
  quickFilters: QuickFilter[];
  sortField: SortField;
  sortDir: SortDir;
  addToast: ReturnType<typeof useToast>['addToast'];
  confirm: ReturnType<typeof useConfirmDialog>['confirm'];
  refresh: () => void;
};

export function useUsersManageBulk({
  t,
  staff,
  selfId,
  selectedRows,
  setSelectedRows,
  setBulkBusy,
  setBulkProgress,
  setExporting,
  search,
  roleFilter,
  quickFilters,
  sortField,
  sortDir,
  addToast,
  confirm,
  refresh,
}: Deps) {
  const { adminFetch } = useAdminFetch();

  // Enchaîne des mutations unitaires sur la sélection (pas d'endpoint bulk
  // côté API), en publiant l'avancement : sur 30 comptes la boucle dure
  // plusieurs secondes, un simple spinner ne dit pas où on en est. Renvoie le
  // décompte ok / échecs + les libellés qui ont échoué (savoir COMBIEN ont
  // échoué sans savoir LESQUELS n'aide personne).
  const runBulk = async (
    targets: UserLite[],
    fn: (u: UserLite) => Promise<void>
  ) => {
    let ok = 0;
    const failures: string[] = [];
    setBulkProgress({ done: 0, total: targets.length });
    for (const u of targets) {
      try {
        await fn(u);
        ok += 1;
      } catch {
        failures.push(u.display_name || u.email || u.id);
      }
      setBulkProgress((prev) =>
        prev ? { ...prev, done: prev.done + 1 } : prev
      );
    }
    setBulkProgress(null);
    return { ok, failed: failures.length, failures };
  };

  /** Toast de fin d'action de masse — nomme les échecs (3 max) s'il y en a. */
  const reportBulk = (
    res: { ok: number; failed: number; failures: string[] },
    skipped: number
  ) => {
    addToast(
      format(t.toastBulkDone, {
        ok: res.ok,
        skipped,
        failed: res.failed,
      }),
      res.failed > 0 ? 'warning' : 'success'
    );
    if (res.failures.length) {
      addToast(
        format(t.bulkFailures, {
          names: res.failures.slice(0, 3).join(', '),
          more: res.failures.length > 3 ? ` (+${res.failures.length - 3})` : '',
        }),
        'error'
      );
    }
  };

  const bulkChangeRole = async (role: string) => {
    const targets = Array.from(selectedRows.values());
    const eligible = targets.filter(
      (u) =>
        u.id !== selfId &&
        !isRowLocked(u.role, staff.role) &&
        canGrantRole(staff.role, role) &&
        (u.role || 'member') !== role
    );
    const skipped = targets.length - eligible.length;
    if (eligible.length === 0) {
      addToast(t.bulkNoEligible, 'warning');
      return;
    }
    const ok = await confirm({
      title: format(t.confirmBulkRoleTitle, { count: eligible.length }),
      subtitle: t.confirmBulkRoleSubtitle,
      variant: 'warning',
      confirmLabel: t.confirmBulkBtn,
    });
    if (!ok) return;

    setBulkBusy(true);
    try {
      const res = await runBulk(eligible, (u) =>
        usersClient.patch<void>({ userId: u.id, role })
      );
      reportBulk(res, skipped);
      setSelectedRows(new Map());
      refresh();
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkDelete = async () => {
    const targets = Array.from(selectedRows.values());
    const eligible = targets.filter(
      (u) => u.id !== selfId && !isRowLocked(u.role, staff.role)
    );
    const skipped = targets.length - eligible.length;
    if (eligible.length === 0) {
      addToast(t.bulkNoEligible, 'warning');
      return;
    }
    const ok = await confirm({
      title: format(t.confirmBulkDeleteTitle, { count: eligible.length }),
      subtitle: t.confirmBulkDeleteSubtitle,
      variant: 'danger',
      confirmLabel: t.confirmBulkBtn,
    });
    if (!ok) return;

    setBulkBusy(true);
    try {
      const res = await runBulk(eligible, (u) =>
        usersClient.remove(u.id).then(() => undefined)
      );
      reportBulk(res, skipped);
      setSelectedRows(new Map());
      refresh();
    } finally {
      setBulkBusy(false);
    }
  };

  // Export CSV : produit et journalisé CÔTÉ SERVEUR (GET /api/admin/users/
  // export), avec les filtres et le tri courants. Le navigateur ne fait plus
  // que télécharger le fichier — plus de pagination, de 429 ni de fichier
  // tronqué faute de requêtes.
  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await adminFetch(
        buildUsersExportUrl({
          search,
          role: roleFilter,
          filters: quickFilters,
          sort: sortField,
          dir: sortDir,
        })
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: unknown;
        } | null;
        throw new Error(
          typeof body?.error === 'string' ? body.error : t.errExport
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        filenameFromContentDisposition(
          res.headers.get('Content-Disposition')
        ) ?? 'utilisateurs.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Révoquer dans la foulée du clic coupe le téléchargement sous Firefox.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (res.headers.get('X-Export-Truncated') === '1') {
        addToast(
          format(t.exportTruncated, {
            count: Number(res.headers.get('X-Export-Count')) || 0,
          }),
          'warning'
        );
      }
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errExport, 'error');
    } finally {
      setExporting(false);
    }
  };

  return { bulkChangeRole, bulkDelete, exportCsv };
}
