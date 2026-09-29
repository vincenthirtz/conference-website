// pages/admin/users/manage.tsx — gestion des inscrits (comptes, rôles,
// suspension, actions en lot). Passée en « Le Ruban » (lot 8B) et découpée :
// types et règles pures dans features/admin/users/manageModel.ts, blocs
// d'affichage dans features/admin/users/ui/UsersManage*.tsx, actions en lot et
// export CSV dans features/admin/users/hooks/useUsersManageBulk.ts. La page
// garde l'état, les confirmations et les appels réseau unitaires.

import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminResource } from '@/hooks/useAdminResource';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { roleLabel } from '@/components/admin/users/roleDisplay';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { useLang } from '@/lib/i18n/LanguageProvider';
import nsAdminUsersManage from '@/lib/i18n/locales/admin-fr/adminUsersManage';
import StaffPermissionsDialog from '@/components/admin/users/StaffPermissionsDialog';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import {
  BATTLE_TAG_RE,
  DEFAULT_DIR,
  canGrantRole,
  isTargetProtected,
  readViewState,
  type AccountLog,
  type ApiResponse,
  type QuickFilter,
  type SortDir,
  type SortField,
  type StaffShape,
  type SuspendDuration,
  type UserLite,
} from '@/features/admin/users/manageModel';
import { useUsersManageBulk } from '@/features/admin/users/hooks/useUsersManageBulk';
import UsersManageRow from '@/features/admin/users/ui/UsersManageRow';
import UsersManageFilters from '@/features/admin/users/ui/UsersManageFilters';
import {
  UsersManageBulkBar,
  UsersManageListBody,
  UsersManagePagination,
  UsersManageSortBar,
} from '@/features/admin/users/ui/UsersManageList';
import {
  UsersManageBattleTagModal,
  UsersManageDeleteModal,
  UsersManageEditModal,
  UsersManageLogsModal,
  UsersManageSuspendModal,
} from '@/features/admin/users/ui/UsersManageModals';

export const getServerSideProps = withStaffPage({ permission: 'manage_staff' });

export default function ManageUsersPage({ staff }: { staff: StaffShape }) {
  const t = useAdminT(nsAdminUsersManage);
  const { lang } = useLang();
  const [total, setTotal] = useState<number | null>(null);

  const router = useRouter();
  // Lu UNE fois : ensuite c'est l'état React qui pilote l'URL, pas l'inverse
  // (sinon chaque replace() relancerait une réinitialisation).
  const [initialView] = useState(() => readViewState(router.query));

  // filters + tri
  const [search, setSearch] = useState(initialView.search);
  const [roleFilter, setRoleFilter] = useState<string | null>(initialView.role);
  const [quickFilters, setQuickFilters] = useState<QuickFilter[]>(
    initialView.filters
  );
  const [sortField, setSortField] = useState<SortField>(initialView.sortField);
  const [sortDir, setSortDir] = useState<SortDir>(initialView.sortDir);

  const [updating, setUpdating] = useState<string | null>(null);
  /**
   * Sélection = Map id → ligne, et non un simple Set d'ids : les actions de
   * masse doivent pouvoir porter sur des lignes cochées à la page 1 alors
   * qu'on est page 3 (le tableau `users` ne contient que la page courante).
   */
  const [selectedRows, setSelectedRows] = useState<Map<string, UserLite>>(
    new Map()
  );
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [exporting, setExporting] = useState(false);

  /** Compte auth de l'appelant : sa ligne est exclue de tout ce que l'API
   *  refuse de toute façon sur soi-même (rôle, suppression, bulk). */
  const selfId = staff.auth_user_id;

  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const {
    data: users,
    loading,
    offset,
    limit,
    setOffset,
    resetOffset,
    mutate,
    refresh,
    error: loadError,
  } = useAdminResource<UserLite, ApiResponse>('/api/admin/users/manage', {
    limit: 20,
    initialOffset: initialView.offset,
    includeTotal: false,
    query: search,
    params: {
      role: roleFilter,
      sort: sortField,
      dir: sortDir,
      filters: quickFilters.length ? quickFilters.join(',') : null,
    },
    select: (res) => res.items || [],
    onData: (res) => setTotal(res.total ?? res.items?.length ?? 0),
  });

  // Filtre rôle / tri repartent de la première page — sauf au montage, où
  // l'offset vient de l'URL et doit être respecté.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    resetOffset();
  }, [roleFilter, quickFilters, sortField, sortDir, resetOffset]);

  // La sélection survit à la pagination (cf. selectedRows) mais pas à un
  // changement de jeu de résultats : garder des lignes cochées qui ne
  // correspondent plus au filtre affiché serait un piège.
  useEffect(() => {
    setSelectedRows(new Map());
  }, [search, roleFilter, quickFilters, sortField, sortDir]);

  // État de la vue → URL. `replace` et non `push` : on n'empile pas une entrée
  // d'historique par frappe au clavier (le bouton « précédent » doit sortir de
  // la page, pas rejouer douze filtres). Débouncé pour la même raison que la
  // recherche : une réécriture d'URL par caractère saisi est inutile.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dépendances choisies à dessein (exclusion reprise d’ESLint)
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);
      if (quickFilters.length) params.set('filters', quickFilters.join(','));
      if (sortField !== 'created_at') params.set('sort', sortField);
      if (sortDir !== 'desc') params.set('dir', sortDir);
      if (offset > 0) params.set('offset', String(offset));
      const qs = params.toString();
      void router.replace(
        qs ? `${router.pathname}?${qs}` : router.pathname,
        undefined,
        { shallow: true }
      );
    }, 300);
    return () => clearTimeout(timer);
    // `router` est volontairement hors deps : il change d'identité à chaque
    // navigation et relancerait l'effet en boucle.
  }, [search, roleFilter, quickFilters, sortField, sortDir, offset]);

  useEffect(() => {
    if (loadError) addToast(loadError, 'error');
  }, [loadError, addToast]);

  // Battle tag edit modal
  const [editingBattleTag, setEditingBattleTag] = useState<{
    userId: string;
    teamId: string;
    teamName: string;
    currentTag: string;
  } | null>(null);
  const [newBattleTag, setNewBattleTag] = useState('');
  const [battleTagSaving, setBattleTagSaving] = useState(false);
  const [battleTagError, setBattleTagError] = useState<string | null>(null);

  // Edit user modal
  const [editingUser, setEditingUser] = useState<UserLite | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete confirmation — la suppression est irréversible (compte + rosters
  // + accès staff) : on demande de recopier l'identifiant du compte, comme
  // pour n'importe quelle suppression destructive.
  const [deletingUser, setDeletingUser] = useState<UserLite | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  const openDeleteUser = useCallback((user: UserLite) => {
    setDeletingUser(user);
    setDeleteConfirmInput('');
  }, []);

  // Resend credentials
  const [resendingUser, setResendingUser] = useState<string | null>(null);

  // Journal du compte — staff_logs filtrés sur entity_type='user' + entity_id.
  // Répond à « qui a changé ça, et quand ? » sans quitter la liste ni aller
  // fouiller /admin/logs à la main.
  const [logsUser, setLogsUser] = useState<UserLite | null>(null);
  const [logs, setLogs] = useState<AccountLog[] | null>(null);
  const [logsError, setLogsError] = useState<string | null>(null);

  // Permissions accordées à l'unité : la boîte vit dans son propre composant
  // (lot A7), la page n'en garde que la cible ouverte.
  const [permissionsUser, setPermissionsUser] = useState<UserLite | null>(null);

  const openLogs = useCallback(
    async (user: UserLite) => {
      setLogsUser(user);
      setLogs(null);
      setLogsError(null);
      try {
        const json = await adminFetchJson<{ logs: AccountLog[] }>(
          `/api/admin/logs?userId=${encodeURIComponent(user.id)}&limit=25`
        );
        setLogs(json.logs || []);
      } catch (err: unknown) {
        setLogsError((err as Error)?.message || t.errLogs);
      }
    },
    [adminFetchJson, t]
  );

  // Suspension (alternative à la suppression : le compte et ses rosters
  // restent intacts, seule la connexion est refusée).
  const [suspendingUser, setSuspendingUser] = useState<UserLite | null>(null);
  const [suspendDuration, setSuspendDuration] =
    useState<SuspendDuration>('24h');
  const [suspendSaving, setSuspendSaving] = useState(false);
  const [suspendError, setSuspendError] = useState<string | null>(null);

  const openSuspend = useCallback((user: UserLite) => {
    setSuspendingUser(user);
    setSuspendDuration('24h');
    setSuspendError(null);
  }, []);

  const confirmSuspend = async () => {
    if (!suspendingUser) return;
    setSuspendSaving(true);
    setSuspendError(null);
    try {
      await adminFetchJson('/api/admin/users/manage', {
        method: 'PATCH',
        body: JSON.stringify({
          userId: suspendingUser.id,
          action: 'suspend',
          duration: suspendDuration,
        }),
      });
      setSuspendingUser(null);
      addToast(t.toastSuspended, 'success');
      // L'échéance exacte est calculée par GoTrue : on la relit plutôt que de
      // la deviner côté client.
      refresh();
    } catch (err: unknown) {
      setSuspendError((err as Error)?.message || t.errSuspend);
    } finally {
      setSuspendSaving(false);
    }
  };

  const unsuspendUser = useCallback(
    async (user: UserLite) => {
      const ok = await confirm({
        title: t.confirmUnsuspendTitle,
        subtitle: format(t.confirmUnsuspendSubtitle, {
          name: user.display_name || user.email || user.id,
        }),
        variant: 'warning',
        confirmLabel: t.confirmUnsuspendBtn,
      });
      if (!ok) return;
      try {
        await adminFetchJson('/api/admin/users/manage', {
          method: 'PATCH',
          body: JSON.stringify({ userId: user.id, action: 'unsuspend' }),
        });
        mutate((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, banned_until: null } : u))
        );
        addToast(t.toastUnsuspended, 'success');
      } catch (err: unknown) {
        addToast((err as Error)?.message || t.errSuspend, 'error');
      }
    },
    [confirm, adminFetchJson, mutate, addToast, t]
  );

  const handleSort = useCallback((field: SortField) => {
    setSortField((prevField) => {
      setSortDir((prevDir) =>
        prevField === field
          ? prevDir === 'asc'
            ? 'desc'
            : 'asc'
          : DEFAULT_DIR[field]
      );
      return field;
    });
  }, []);

  const toggleQuickFilter = useCallback((f: QuickFilter) => {
    setQuickFilters((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    );
  }, []);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    resetOffset();
  }

  const changeRole = useCallback(
    async (targetUser: UserLite, role: string) => {
      const previousRole = targetUser.role ?? null;
      if (previousRole === role) return;

      if (isTargetProtected(previousRole) && staff.role !== 'owner') {
        addToast(t.errOwnerOnly, 'error');
        return;
      }
      if (!canGrantRole(staff.role, role)) {
        addToast(t.errRoleEscalation, 'error');
        return;
      }

      const ok = await confirm({
        title: format(t.confirmRoleTitle, { role: roleLabel(t, role) }),
        subtitle: format(t.confirmRoleSubtitle, {
          from: roleLabel(t, previousRole),
          to: roleLabel(t, role),
        }),
        variant: 'warning',
        confirmLabel: t.confirmRoleBtn,
      });
      if (!ok) return;

      setUpdating(targetUser.id);
      try {
        await adminFetchJson('/api/admin/users/manage', {
          method: 'PATCH',
          body: JSON.stringify({ userId: targetUser.id, role }),
        });
        mutate((prev) =>
          prev.map((u) => (u.id === targetUser.id ? { ...u, role } : u))
        );
        addToast(t.toastRoleUpdated, 'success');
      } catch (err: unknown) {
        addToast((err as Error)?.message || t.errRoleUpdate, 'error');
      } finally {
        setUpdating(null);
      }
    },
    [staff.role, confirm, adminFetchJson, mutate, addToast, t]
  );

  const openBattleTagEdit = useCallback(
    (
      userId: string,
      teamId: string,
      teamName: string,
      currentTag: string | null
    ) => {
      setEditingBattleTag({
        userId,
        teamId,
        teamName,
        currentTag: currentTag || '',
      });
      setNewBattleTag(currentTag || '');
      setBattleTagError(null);
    },
    []
  );

  const saveBattleTag = async () => {
    if (!editingBattleTag) return;
    const trimmed = newBattleTag.trim();
    // Validation locale AVANT l'aller-retour : le serveur applique la même
    // regex, autant ne pas faire payer un round-trip à une faute de frappe.
    if (trimmed && !BATTLE_TAG_RE.test(trimmed)) {
      setBattleTagError(t.battleTagInvalid);
      return;
    }
    setBattleTagSaving(true);
    setBattleTagError(null);
    try {
      const json = await adminFetchJson<{
        membership?: {
          battle_tag: string | null;
          battle_tag_verified_at: string | null;
          battle_tag_mismatch: boolean;
        };
      }>('/api/admin/users/manage', {
        method: 'PATCH',
        body: JSON.stringify({
          userId: editingBattleTag.userId,
          teamId: editingBattleTag.teamId,
          battleTag: trimmed,
        }),
      });
      // Le serveur invalide la vérification Battle.net quand le tag change :
      // on reprend SON état plutôt que de deviner, sinon la pastille
      // « ✓ vérifié » survivrait à l'édition jusqu'au prochain refetch.
      mutate((prev) =>
        prev.map((u) => {
          if (u.id === editingBattleTag.userId && u.team_memberships) {
            return {
              ...u,
              team_memberships: u.team_memberships.map((tm) =>
                tm.team_id === editingBattleTag.teamId
                  ? {
                      ...tm,
                      battle_tag:
                        json.membership?.battle_tag ?? (trimmed || null),
                      battle_tag_verified_at:
                        json.membership?.battle_tag_verified_at ?? null,
                      battle_tag_mismatch:
                        json.membership?.battle_tag_mismatch ?? false,
                    }
                  : tm
              ),
            };
          }
          return u;
        })
      );
      setEditingBattleTag(null);
      addToast(t.toastBattleTagUpdated, 'success');
    } catch (err: unknown) {
      setBattleTagError((err as Error)?.message || t.errUnexpected);
    } finally {
      setBattleTagSaving(false);
    }
  };

  const openEditUser = useCallback((user: UserLite) => {
    setEditingUser(user);
    setEditDisplayName(user.display_name || '');
    setEditError(null);
  }, []);

  const saveEditUser = async () => {
    if (!editingUser) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await adminFetchJson('/api/admin/users/manage', {
        method: 'PATCH',
        body: JSON.stringify({
          userId: editingUser.id,
          display_name: editDisplayName.trim(),
        }),
      });
      mutate((prev) =>
        prev.map((u) =>
          u.id === editingUser.id
            ? { ...u, display_name: editDisplayName.trim() || null }
            : u
        )
      );
      setEditingUser(null);
      addToast(t.toastUserUpdated, 'success');
    } catch (err: unknown) {
      setEditError((err as Error)?.message || t.errUnexpected);
    } finally {
      setEditSaving(false);
    }
  };

  const resendCredentials = useCallback(
    async (user: UserLite) => {
      if (!user.email) return;
      const ok = await confirm({
        title: t.confirmResendTitle,
        subtitle: format(t.confirmResendSubtitle, { email: user.email }),
        variant: 'warning',
        confirmLabel: t.confirmSend,
      });
      if (!ok) return;

      setResendingUser(user.id);
      try {
        const json = await adminFetchJson<{ warning?: string }>(
          '/api/admin/users/manage',
          {
            method: 'PATCH',
            body: JSON.stringify({
              userId: user.id,
              action: 'resend_credentials',
            }),
          }
        );
        if (json.warning) {
          addToast(json.warning, 'warning');
        } else {
          addToast(
            format(t.toastCredentialsSent, { email: user.email }),
            'success'
          );
        }
      } catch (err: unknown) {
        addToast((err as Error)?.message || t.errSend, 'error');
      } finally {
        setResendingUser(null);
      }
    },
    [confirm, adminFetchJson, addToast, t]
  );

  const deleteUser = async () => {
    if (!deletingUser) return;
    setDeleteLoading(true);
    try {
      await adminFetchJson('/api/admin/users/manage', {
        method: 'DELETE',
        body: JSON.stringify({ userId: deletingUser.id }),
      });
      mutate((prev) => prev.filter((u) => u.id !== deletingUser!.id));
      setTotal((prev) => (prev !== null ? prev - 1 : prev));
      setDeletingUser(null);
      addToast(t.toastUserDeleted, 'success');
      refresh(); // backfill : recharge la page pour recompléter la 20e ligne
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errDelete, 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  const toggleSelect = useCallback((user: UserLite) => {
    setSelectedRows((prev) => {
      const next = new Map(prev);
      if (next.has(user.id)) next.delete(user.id);
      else next.set(user.id, user);
      return next;
    });
  }, []);

  // Sa propre ligne n'est jamais sélectionnable : la garder ferait échouer
  // chaque action de masse sur un 403 prévisible.
  const selectableUsers = users.filter((u) => u.id !== selfId);

  const allPageSelected =
    selectableUsers.length > 0 &&
    selectableUsers.every((u) => selectedRows.has(u.id));

  const toggleSelectAll = () => {
    setSelectedRows((prev) => {
      const next = new Map(prev);
      if (
        selectableUsers.length > 0 &&
        selectableUsers.every((u) => prev.has(u.id))
      ) {
        selectableUsers.forEach((u) => next.delete(u.id));
        return next;
      }
      selectableUsers.forEach((u) => next.set(u.id, u));
      return next;
    });
  };

  const { bulkChangeRole, bulkDelete, exportCsv } = useUsersManageBulk({
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
    adminFetchJson,
    addToast,
    confirm,
    refresh,
  });

  const selectedCount = selectedRows.size;

  /** Ce que l'utilisateur doit recopier pour confirmer la suppression. */
  const deleteConfirmValue =
    deletingUser?.email || deletingUser?.display_name || deletingUser?.id || '';
  const deleteConfirmed =
    deleteConfirmInput.trim().toLowerCase() ===
    deleteConfirmValue.trim().toLowerCase();

  return (
    <>
      {confirmDialog}
      <Head>
        <title>{t.headTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <AdminPageHeader
          title={t.heading}
          subtitle={
            total !== null
              ? format(total > 1 ? t.userCount_other : t.userCount_one, {
                  count: total,
                })
              : t.loading
          }
          actions={
            <>
              <AdminButton
                variant="ghost"
                onClick={exportCsv}
                disabled={exporting}
              >
                {exporting && (
                  <span
                    aria-hidden
                    className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                  />
                )}
                {exporting ? t.exportingCsv : t.exportCsv}
              </AdminButton>
              <AdminButtonLink href="/admin/users/new" variant="primary">
                {t.newUser}
              </AdminButtonLink>
            </>
          }
        />

        <UsersManageFilters
          t={t}
          search={search}
          onSearchChange={setSearch}
          onSubmit={handleSearchSubmit}
          roleFilter={roleFilter}
          onRoleFilterChange={setRoleFilter}
          loading={loading}
          total={total}
          quickFilters={quickFilters}
          onToggleQuickFilter={toggleQuickFilter}
          onClearQuickFilters={() => setQuickFilters([])}
        />

        {/* Users List */}
        <section className="overflow-hidden rounded-[var(--r-card,14px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s1,#100812)]">
          <UsersManageSortBar
            t={t}
            sortField={sortField}
            sortDir={sortDir}
            onSort={handleSort}
          />

          {!loading && users.length > 0 && (
            <UsersManageBulkBar
              t={t}
              staffCanGrant={(r) => canGrantRole(staff.role, r)}
              allPageSelected={allPageSelected}
              onToggleSelectAll={toggleSelectAll}
              selectedCount={selectedCount}
              bulkProgress={bulkProgress}
              bulkBusy={bulkBusy}
              onBulkRole={bulkChangeRole}
              onBulkDelete={bulkDelete}
              onClear={() => setSelectedRows(new Map())}
            />
          )}

          <UsersManageListBody
            t={t}
            loading={loading}
            empty={users.length === 0}
          >
            {users.map((u) => (
              <UsersManageRow
                key={u.id}
                u={u}
                t={t}
                lang={lang}
                staffRole={staff.role}
                isSelf={u.id === selfId}
                updating={updating === u.id}
                resending={resendingUser === u.id}
                selected={selectedRows.has(u.id)}
                onToggleSelect={toggleSelect}
                onChangeRole={changeRole}
                onOpenBattleTag={openBattleTagEdit}
                onResend={resendCredentials}
                onEdit={openEditUser}
                onSuspend={openSuspend}
                onUnsuspend={unsuspendUser}
                onOpenLogs={openLogs}
                onOpenPermissions={setPermissionsUser}
                onDelete={openDeleteUser}
              />
            ))}
          </UsersManageListBody>
        </section>

        <UsersManagePagination
          t={t}
          offset={offset}
          shown={users.length}
          total={total}
          prevDisabled={offset === 0}
          nextDisabled={total !== null && offset + limit >= total}
          onPrev={() => setOffset(Math.max(0, offset - limit))}
          onNext={() => setOffset(offset + limit)}
        />
      </div>

      <UsersManageEditModal
        t={t}
        user={editingUser}
        displayName={editDisplayName}
        onDisplayNameChange={setEditDisplayName}
        saving={editSaving}
        error={editError}
        onClose={() => setEditingUser(null)}
        onSave={saveEditUser}
      />

      <UsersManageDeleteModal
        t={t}
        user={deletingUser}
        confirmValue={deleteConfirmValue}
        confirmInput={deleteConfirmInput}
        onConfirmInputChange={setDeleteConfirmInput}
        confirmed={deleteConfirmed}
        loading={deleteLoading}
        onClose={() => {
          setDeletingUser(null);
          setDeleteConfirmInput('');
        }}
        onCancel={() => setDeletingUser(null)}
        onDelete={deleteUser}
      />

      {/* Permissions accordées à l'unité — staff uniquement. */}
      {permissionsUser && (
        <StaffPermissionsDialog
          userId={permissionsUser.id}
          userName={
            permissionsUser.display_name ||
            permissionsUser.email ||
            permissionsUser.id
          }
          onClose={() => setPermissionsUser(null)}
        />
      )}

      <UsersManageLogsModal
        t={t}
        user={logsUser}
        logs={logs}
        error={logsError}
        onClose={() => setLogsUser(null)}
      />

      <UsersManageSuspendModal
        t={t}
        user={suspendingUser}
        duration={suspendDuration}
        onDurationChange={setSuspendDuration}
        saving={suspendSaving}
        error={suspendError}
        onClose={() => setSuspendingUser(null)}
        onConfirm={confirmSuspend}
      />

      <UsersManageBattleTagModal
        t={t}
        open={Boolean(editingBattleTag)}
        teamName={editingBattleTag?.teamName}
        value={newBattleTag}
        onValueChange={setNewBattleTag}
        saving={battleTagSaving}
        error={battleTagError}
        onClose={() => setEditingBattleTag(null)}
        onSave={saveBattleTag}
      />
    </>
  );
}
