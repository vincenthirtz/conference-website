// features/admin/users/hooks/useUsersManageBulk.ts — les actions en lot et
// l'export CSV de la gestion des inscrits (pages/admin/users/manage.tsx).
//
// Sortis TELS QUELS de la page (gelée en taille, règle A7) : mêmes corps, mêmes
// confirmations, mêmes appels et payloads. Aucun état n'est créé ici : la page
// garde `selectedRows`, `bulkBusy`, `bulkProgress`, `exporting` et passe leurs
// setters, avec tout ce dont les handlers dépendaient dans sa closure.

import type { Dispatch, SetStateAction } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import { AdminHttpError } from '@/utils/admin/adminHttp';
import { usersClient } from '../client';
import type { useConfirmDialog } from '@/hooks/useConfirmDialog';
import type { useToast } from '@/components/Toast';
import { csvCell, isSuspended } from '@/components/admin/users/manageFormat';
import {
  canGrantRole,
  isRowLocked,
  isStaffRoleValue,
  type ApiResponse,
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

  const exportCsv = async () => {
    setExporting(true);
    let truncated = false;
    try {
      const collected: UserLite[] = [];
      const pageSize = 200;
      let off = 0;
      // Rapatrie toutes les lignes correspondant aux filtres/tri courants.
      // L'endpoint est limité à 60 req/min : sur un gros export on finit par
      // se prendre un 429. On attend et on retente au lieu de tout perdre —
      // et si ça persiste, on exporte quand même ce qui a été collecté.
      for (let guard = 0; guard < 100; guard += 1) {
        const qs = new URLSearchParams();
        if (search) qs.set('search', search);
        if (roleFilter) qs.set('role', roleFilter);
        if (quickFilters.length) qs.set('filters', quickFilters.join(','));
        qs.set('sort', sortField);
        qs.set('dir', sortDir);
        qs.set('limit', String(pageSize));
        qs.set('offset', String(off));

        let items: UserLite[] | null = null;
        for (let attempt = 0; attempt < 3 && items === null; attempt += 1) {
          try {
            const json = await usersClient.managePage<ApiResponse>(
              qs.toString()
            );
            items = json.items || [];
          } catch (err: unknown) {
            const rateLimited =
              err instanceof AdminHttpError && err.status === 429;
            if (!rateLimited || attempt === 2) {
              if (collected.length === 0) throw err;
              truncated = true;
              break;
            }
            await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
          }
        }
        if (items === null) break; // export partiel (cf. `truncated`)

        collected.push(...items);
        if (items.length < pageSize) break;
        off += pageSize;
      }

      const header = [
        'id',
        'email',
        'display_name',
        'account_role',
        'role_scope',
        'created_at',
        'last_sign_in_at',
        'banned_until',
        'discord',
        'teams',
      ];
      const lines = [
        header.join(','),
        ...collected.map((u) =>
          [
            u.id,
            u.email || '',
            u.display_name || '',
            u.role || '',
            isStaffRoleValue(u.role) ? 'staff' : 'community',
            u.created_at || '',
            u.last_sign_in_at || '',
            isSuspended(u.banned_until) ? u.banned_until || '' : '',
            u.discord_username || u.discord_user_id || '',
            (u.team_memberships || [])
              .map((tm) => `${tm.team_name} (${tm.role || '—'})`)
              .join('; '),
          ]
            .map((c) => csvCell(String(c)))
            .join(',')
        ),
      ];
      const csv = '﻿' + lines.join('\r\n'); // BOM pour Excel
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'utilisateurs.csv';
      a.click();
      URL.revokeObjectURL(url);
      if (truncated) {
        addToast(
          format(t.exportTruncated, { count: collected.length }),
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
