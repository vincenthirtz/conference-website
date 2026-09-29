// features/admin/teams/hooks/useTeamEditRosterBulk.ts — la sélection
// multiple du roster de la fiche équipe (pages/admin/teams/[teamId]/edit.tsx) :
// répartition roster / remplaçantes / encadrement et actions groupées
// (rôle, remplaçante, retrait) via `/roster-bulk`.
//
// Corps DÉPLACÉS À L'IDENTIQUE depuis la page (lot 9B) : seuls les accès à
// l'état et aux outils de la page deviennent des paramètres. La page reste
// propriétaire de tous les useState / useRef ; les tableaux de dépendances
// d'origine sont conservés tels quels.

import { useCallback, useMemo } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import { isNonPlayingTeamRole } from '@/utils/teams/roleKind';
import type { TeamRow, TeamMemberRow } from '@/types/admin';
import type {
  AddToast,
  AdminFetchJson,
  Confirm,
  Dict,
  Setter,
} from './teamEditHookTypes';

export type UseTeamEditRosterBulkDeps = {
  t: Dict;
  teamId: string | undefined;
  team: TeamRow | null;
  members: TeamMemberRow[];
  selectedIds: Set<string>;
  setSelectedIds: Setter<Set<string>>;
  bulkRole: string;
  setBulkRole: Setter<string>;
  setBulkBusy: Setter<boolean>;
  setErrorMsg: Setter<string | null>;
  adminFetchJson: AdminFetchJson;
  addToast: AddToast;
  confirm: Confirm;
  clearSelection: () => void;
  fetchMembers: () => Promise<void>;
  fetchTeam: () => Promise<void>;
};

export function useTeamEditRosterBulk(deps: UseTeamEditRosterBulkDeps) {
  const {
    t,
    teamId,
    team,
    members,
    selectedIds,
    setSelectedIds,
    bulkRole,
    setBulkRole,
    setBulkBusy,
    setErrorMsg,
    adminFetchJson,
    addToast,
    confirm,
    clearSelection,
    fetchMembers,
    fetchTeam,
  } = deps;

  // --- Bulk actions -------------------------------------------------------
  const captainUserId = team?.captain_id ?? null;
  // Mémoïsés : sinon ces filtres O(n) tournaient à chaque frappe (re-render).
  const selectedMembers = useMemo(
    () => members.filter((m) => selectedIds.has(m.id)),
    [members, selectedIds]
  );
  const selectionHasCaptain = useMemo(
    () =>
      selectedMembers.some(
        (m) => captainUserId !== null && m.user_id === captainUserId
      ),
    [selectedMembers, captainUserId]
  );
  // Roster / remplaçantes / encadrement — mémoïsés pour la section Membres.
  //
  // Coach et manager ne sont pas des joueuses : les afficher dans le roster
  // gonflait l'effectif visible et les rendait échangeables avec une
  // remplaçante. Même définition que la règle BattleTag côté API
  // (`isNonPlayingTeamRole`), pour que les deux ne divergent pas.
  const { rosterMembers, subMembers, staffMembers } = useMemo(() => {
    const staff = members.filter((m) => isNonPlayingTeamRole(m.role));
    const playing = members.filter((m) => !isNonPlayingTeamRole(m.role));
    return {
      rosterMembers: playing.filter((m) => !m.is_substitute),
      subMembers: playing.filter((m) => m.is_substitute),
      staffMembers: staff,
    };
  }, [members]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters et refs stables reçus en paramètre)
  const runBulk = useCallback(
    async (
      operation: 'set_role' | 'set_substitute' | 'remove',
      extra: Record<string, unknown> = {}
    ) => {
      if (!teamId || selectedIds.size === 0) return;
      setBulkBusy(true);
      setErrorMsg(null);
      try {
        const json = await adminFetchJson<{
          successCount?: number;
          failureCount?: number;
        }>(`/api/admin/teams/${teamId}/roster-bulk`, {
          method: 'POST',
          body: JSON.stringify({
            operation,
            memberIds: Array.from(selectedIds),
            ...extra,
          }),
        });
        const { successCount = 0, failureCount = 0 } = json;
        addToast(
          failureCount > 0
            ? format(t.bulkPartial, {
                success: successCount,
                failure: failureCount,
              })
            : format(t.bulkSuccess, { success: successCount }),
          failureCount > 0 ? 'info' : 'success'
        );
        clearSelection();
        setBulkRole('');
        await fetchMembers();
        await fetchTeam();
      } catch (err: unknown) {
        setErrorMsg((err as Error)?.message ?? t.errUnexpected);
      } finally {
        setBulkBusy(false);
      }
    },
    [
      teamId,
      selectedIds,
      adminFetchJson,
      addToast,
      clearSelection,
      fetchMembers,
      fetchTeam,
      t,
    ]
  );

  const handleBulkRemove = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm({
      title: format(t.confirmBulkRemove, { count: selectedIds.size }),
      variant: 'danger',
    });
    if (!ok) return;
    await runBulk('remove');
  }, [selectedIds, runBulk, confirm, t]);

  // Handlers bulk stables passés à MembersSection.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters et refs stables reçus en paramètre)
  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) setSelectedIds(new Set(members.map((m) => m.id)));
      else clearSelection();
    },
    [members, clearSelection]
  );

  const handleBulkSetRole = useCallback(
    () => runBulk('set_role', { role: bulkRole }),
    [runBulk, bulkRole]
  );

  const handleBulkSetSubstitute = useCallback(
    (isSubstitute: boolean) => runBulk('set_substitute', { isSubstitute }),
    [runBulk]
  );

  return {
    captainUserId,
    selectionHasCaptain,
    rosterMembers,
    subMembers,
    staffMembers,
    handleBulkRemove,
    handleSelectAll,
    handleBulkSetRole,
    handleBulkSetSubstitute,
  };
}
