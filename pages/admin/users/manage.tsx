import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import {
  withStaffPage,
  STAFF_ROLES,
  STAFF_ROLE_RANK,
  type StaffRole,
} from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminResource } from '@/hooks/useAdminResource';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import Modal from '@/components/admin/Modal';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

type Dict = ReturnType<typeof useAdminT<'adminUsersManage'>>;
type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type TeamMembership = {
  team_id: string;
  team_name: string;
  role: string;
  battle_tag: string | null;
};

type UserLite = {
  id: string;
  email: string | null;
  role: string | null;
  display_name: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  team_memberships?: TeamMembership[];
};

type ApiResponse = {
  items: UserLite[];
  total?: number;
};

export const getServerSideProps = withStaffPage('admin');

const ROLES = ['member', 'player', 'caster', 'manager', 'admin', 'owner'];

function roleLabel(t: Dict, role: string | null) {
  switch (role?.toLowerCase()) {
    case 'owner':
      return t.roleOwner;
    case 'admin':
      return t.roleAdmin;
    case 'manager':
      return t.roleManager;
    case 'caster':
      return t.roleCaster;
    case 'player':
      return t.rolePlayer;
    case 'member':
      return t.roleMember;
    default:
      return role || t.roleMember;
  }
}

function roleColor(role: string | null) {
  switch (role?.toLowerCase()) {
    case 'owner':
      return 'bg-purple-600 text-white';
    case 'admin':
      return 'bg-red-600 text-white';
    case 'manager':
      return 'bg-blue-600 text-white';
    case 'caster':
      return 'bg-amber-600 text-white';
    case 'player':
      return 'bg-emerald-600 text-white';
    default:
      return 'bg-neutral-600 text-neutral-100';
  }
}

function formatDate(d: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return d;
  }
}

/**
 * Miroir EXACT des gardes de pages/api/admin/users/manage.ts (l.355-385).
 *
 * 1. targetIsProtected : un owner/admin ne peut être modifié que par un owner.
 *    (Côté API la cible est protégée si son rôle user_metadata OU son rôle
 *    staff vaut owner|admin ; côté client on ne dispose que d'un rôle combiné
 *    `u.role`, on applique donc la même règle dessus.)
 * 2. anti-escalade : un non-owner ne peut octroyer un rôle staff de rang >= au
 *    sien. Les rôles non-staff (member, player, ...) passent toujours.
 */
function isTargetProtected(targetRole: string | null): boolean {
  const r = targetRole?.toLowerCase();
  return r === 'owner' || r === 'admin';
}

function canGrantRole(requesterRole: string | null, role: string): boolean {
  if (requesterRole === 'owner') return true;
  const isStaffRole = (STAFF_ROLES as readonly string[]).includes(role);
  if (!isStaffRole) return true; // member/player : révocation toujours permise
  const newRank = STAFF_ROLE_RANK[role as StaffRole];
  const requesterRank = requesterRole
    ? (STAFF_ROLE_RANK[requesterRole as StaffRole] ?? -1)
    : -1;
  return newRank < requesterRank;
}

export default function ManageUsersPage({ staff }: { staff: StaffShape }) {
  const t = useAdminT('adminUsersManage');
  const [total, setTotal] = useState<number | null>(null);

  // filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | null>(null);

  const [updating, setUpdating] = useState<string | null>(null);
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  // Liste paginée + recherche (debounce ~300ms géré par le hook via `query`) +
  // filtre serveur `role`. `limit: 20` réplique le défaut de
  // /api/admin/users/manage. `total` revient toujours dans le payload →
  // includeTotal:false garde la requête identique
  // (?limit=20&offset=0[&search][&role]). Le total est capté en local via
  // `onData` pour permettre son décrément optimiste à la suppression.
  // L'AbortController du hook remplace l'ancien garde de séquence (fetchSeqRef).
  const {
    data: users,
    loading,
    offset,
    limit,
    setOffset,
    resetOffset,
    mutate,
    error: loadError,
  } = useAdminResource<UserLite, ApiResponse>('/api/admin/users/manage', {
    limit: 20,
    includeTotal: false,
    query: search,
    params: { role: roleFilter },
    select: (res) => res.items || [],
    onData: (res) => setTotal(res.total ?? res.items?.length ?? 0),
  });

  // Le changement de filtre rôle repart de la première page (le reset lié à la
  // recherche est déjà géré par le hook via `query`).
  useEffect(() => {
    resetOffset();
  }, [roleFilter, resetOffset]);

  // Les erreurs de chargement étaient signalées par un toast (la page n'a pas
  // de bannière d'erreur) — on relaie l'erreur du hook de la même façon.
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

  // Delete confirmation
  const [deletingUser, setDeletingUser] = useState<UserLite | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Resend credentials
  const [resendingUser, setResendingUser] = useState<string | null>(null);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    // La recherche est déjà suivie en direct par le hook (`query: search`,
    // debounce ~300ms + reset d'offset). Le submit force juste le retour page 1.
    resetOffset();
  }

  const changeRole = async (userId: string, role: string) => {
    const targetUser = users.find((u) => u.id === userId);
    const previousRole = targetUser?.role ?? null;
    if (previousRole === role) return;

    // Garde UI miroir de l'API : ne pas même tenter une action qui sera
    // refusée 403 côté serveur (modifier un owner/admin, ou octroyer un rôle
    // >= au sien sans être owner).
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

    setUpdating(userId);
    try {
      await adminFetchJson('/api/admin/users/manage', {
        method: 'PATCH',
        body: JSON.stringify({ userId, role }),
      });

      mutate((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
      addToast(t.toastRoleUpdated, 'success');
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errRoleUpdate, 'error');
    } finally {
      setUpdating(null);
    }
  };

  const openBattleTagEdit = (
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
  };

  const saveBattleTag = async () => {
    if (!editingBattleTag) return;

    setBattleTagSaving(true);
    setBattleTagError(null);

    try {
      await adminFetchJson('/api/admin/users/manage', {
        method: 'PATCH',
        body: JSON.stringify({
          userId: editingBattleTag.userId,
          teamId: editingBattleTag.teamId,
          battleTag: newBattleTag.trim(),
        }),
      });

      mutate((prev) =>
        prev.map((u) => {
          if (u.id === editingBattleTag.userId && u.team_memberships) {
            return {
              ...u,
              team_memberships: u.team_memberships.map((tm) =>
                tm.team_id === editingBattleTag.teamId
                  ? { ...tm, battle_tag: newBattleTag.trim() || null }
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

  const openEditUser = (user: UserLite) => {
    setEditingUser(user);
    setEditDisplayName(user.display_name || '');
    setEditError(null);
  };

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

  const resendCredentials = async (user: UserLite) => {
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
  };

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
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errDelete, 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      {confirmDialog}
      <Head>
        <title>{t.headTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  {t.heading}
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  {total !== null
                    ? format(total > 1 ? t.userCount_other : t.userCount_one, {
                        count: total,
                      })
                    : t.loading}
                </p>
              </div>

              <Link
                href="/admin/users/new"
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors flex items-center gap-2"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                {t.newUser}
              </Link>
            </div>
          </div>

          {/* Filters */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
            <form
              onSubmit={handleSearchSubmit}
              className="flex gap-4 flex-wrap items-end"
            >
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.searchLabel}
                </label>
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <input
                    type="text"
                    placeholder={t.searchPlaceholder}
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="min-w-[160px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.roleLabel}
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={roleFilter || ''}
                  onChange={(e) => setRoleFilter(e.target.value || null)}
                >
                  <option value="">{t.allRoles}</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {roleLabel(t, r)}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors flex items-center gap-2"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                {t.searchButton}
              </button>
            </form>
          </section>

          {/* Users List */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-20 text-neutral-400">
                <svg
                  className="w-12 h-12 mx-auto mb-4 text-neutral-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
                {t.emptyUsers}
              </div>
            ) : (
              <div className="divide-y divide-neutral-700/50">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-4 p-4 hover:bg-neutral-700/30 transition-colors group"
                  >
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-xl bg-neutral-700/50 flex items-center justify-center border border-neutral-700">
                        <svg
                          className="w-6 h-6 text-neutral-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                        </svg>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-white truncate">
                          {u.display_name || u.email || t.defaultUser}
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleColor(
                            u.role
                          )}`}
                        >
                          {roleLabel(t, u.role)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-neutral-400 flex-wrap">
                        {u.email && (
                          <span className="font-mono text-xs bg-neutral-800 px-2 py-0.5 rounded truncate max-w-[200px]">
                            {u.email}
                          </span>
                        )}
                        <span>•</span>
                        <span>
                          {format(t.registeredOn, {
                            date: formatDate(u.created_at),
                          })}
                        </span>
                        <span>•</span>
                        <span
                          className={
                            u.last_sign_in_at ? '' : 'text-neutral-500 italic'
                          }
                        >
                          {u.last_sign_in_at
                            ? format(t.lastSignIn, {
                                date: formatDate(u.last_sign_in_at),
                              })
                            : t.neverConnected}
                        </span>
                      </div>
                      {/* Team memberships */}
                      {u.team_memberships && u.team_memberships.length > 0 && (
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {u.team_memberships.map((tm) => (
                            <div
                              key={tm.team_id}
                              className="flex items-center gap-1"
                            >
                              <Link
                                href={`/admin/teams/${tm.team_id}/edit`}
                                className="text-xs text-blue-400 hover:text-blue-300"
                              >
                                {tm.team_name}
                              </Link>
                              {tm.battle_tag ? (
                                <button
                                  onClick={() =>
                                    openBattleTagEdit(
                                      u.id,
                                      tm.team_id,
                                      tm.team_name,
                                      tm.battle_tag
                                    )
                                  }
                                  className="px-1.5 py-0.5 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-xs hover:bg-emerald-600/30 transition-colors"
                                >
                                  {tm.battle_tag}
                                </button>
                              ) : (
                                <button
                                  onClick={() =>
                                    openBattleTagEdit(
                                      u.id,
                                      tm.team_id,
                                      tm.team_name,
                                      null
                                    )
                                  }
                                  className="px-1.5 py-0.5 rounded bg-red-600/20 text-red-300 border border-red-500/30 text-xs hover:bg-red-600/30 transition-colors"
                                >
                                  {t.battleTagPrompt}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex-shrink-0 flex items-center gap-2">
                      <Link
                        href={`/admin/users/${u.id}/player-view`}
                        title={t.playerViewTitle}
                        className="p-2 rounded-lg text-neutral-400 hover:text-emerald-400 hover:bg-neutral-700 transition-colors"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      </Link>

                      {(() => {
                        // Cible protégée (owner/admin) éditable par un owner
                        // uniquement → on verrouille tout le select.
                        const targetLocked =
                          isTargetProtected(u.role) && staff.role !== 'owner';
                        return (
                          <select
                            value={u.role || 'member'}
                            onChange={(e) => changeRole(u.id, e.target.value)}
                            disabled={updating === u.id || targetLocked}
                            title={targetLocked ? t.lockedTitle : undefined}
                            className="px-3 py-1.5 rounded-lg bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {ROLES.map((r) => {
                              // Toujours afficher le rôle courant (sinon le
                              // <select> contrôlé n'aurait aucune option
                              // correspondant à sa value). Les autres options
                              // non-octroyables sont désactivées.
                              const grantable =
                                r === (u.role || 'member') ||
                                canGrantRole(staff.role, r);
                              return (
                                <option key={r} value={r} disabled={!grantable}>
                                  {roleLabel(t, r)}
                                </option>
                              );
                            })}
                          </select>
                        );
                      })()}

                      <button
                        type="button"
                        title={t.resendTitle}
                        onClick={() => resendCredentials(u)}
                        disabled={resendingUser === u.id || !u.email}
                        className="p-2 rounded-lg text-neutral-400 hover:text-amber-400 hover:bg-neutral-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                          />
                        </svg>
                      </button>

                      <button
                        type="button"
                        title={t.editTitle}
                        onClick={() => openEditUser(u)}
                        className="p-2 rounded-lg text-neutral-400 hover:text-blue-400 hover:bg-neutral-700 transition-colors"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>

                      <button
                        type="button"
                        title={t.deleteTitle}
                        onClick={() => setDeletingUser(u)}
                        className="p-2 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-neutral-700 transition-colors"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Pagination */}
          <div className="flex justify-between items-center mt-6">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              {t.previous}
            </button>

            <span className="text-neutral-400 text-sm">
              {format(t.paginationRange, {
                from: offset + 1,
                to: offset + users.length,
              })}
              {total ? format(t.paginationOf, { total }) : ''}
            </span>

            <button
              type="button"
              disabled={total !== null && offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
              className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {t.next}
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Edit User Modal */}
      <Modal
        open={Boolean(editingUser)}
        onClose={() => setEditingUser(null)}
        title={t.editModalTitle}
        subtitle={editingUser?.email || editingUser?.id}
        footer={
          <>
            <button
              onClick={() => setEditingUser(null)}
              className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
            >
              {t.cancel}
            </button>
            <button
              onClick={saveEditUser}
              disabled={editSaving}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {editSaving && (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {editSaving ? t.saving : t.save}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.displayNameLabel}
            </label>
            <input
              type="text"
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder={t.displayNamePlaceholder}
            />
          </div>

          {editError && (
            <div className="rounded-lg bg-red-900/40 border border-red-500/50 px-3 py-2 text-sm text-red-200">
              {editError}
            </div>
          )}
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={Boolean(deletingUser)}
        onClose={() => setDeletingUser(null)}
        title={
          <h3 className="text-lg font-semibold text-red-400">
            {t.deleteModalTitle}
          </h3>
        }
        footer={
          <>
            <button
              onClick={() => setDeletingUser(null)}
              className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
            >
              {t.cancel}
            </button>
            <button
              onClick={deleteUser}
              disabled={deleteLoading}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {deleteLoading && (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {deleteLoading ? t.deleting : t.delete}
            </button>
          </>
        }
      >
        <p className="text-sm text-neutral-300 mb-2">{t.deleteConfirmText}</p>
        <div className="bg-neutral-900/50 rounded-lg px-3 py-2 mb-4">
          <p className="text-sm font-medium text-white">
            {deletingUser?.display_name || t.defaultUser}
          </p>
          <p className="text-xs text-neutral-400 font-mono">
            {deletingUser?.email || deletingUser?.id}
          </p>
        </div>
        <p className="text-xs text-red-300">{t.deleteWarning}</p>
      </Modal>

      {/* Battle Tag Edit Modal */}
      <Modal
        open={Boolean(editingBattleTag)}
        onClose={() => setEditingBattleTag(null)}
        title={t.battleTagModalTitle}
        subtitle={
          <>
            {t.battleTagModalTeamPrefix}
            <span className="text-white">{editingBattleTag?.teamName}</span>
          </>
        }
        footer={
          <>
            <button
              onClick={() => setEditingBattleTag(null)}
              className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
            >
              {t.cancel}
            </button>
            <button
              onClick={saveBattleTag}
              disabled={battleTagSaving}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {battleTagSaving && (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {battleTagSaving ? t.saving : t.save}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.battleTagLabel}
            </label>
            <input
              type="text"
              value={newBattleTag}
              onChange={(e) => setNewBattleTag(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder={t.battleTagPlaceholder}
            />
            <p className="text-xs text-neutral-500 mt-1">{t.battleTagHelp}</p>
          </div>

          {battleTagError && (
            <div className="rounded-lg bg-red-900/40 border border-red-500/50 px-3 py-2 text-sm text-red-200">
              {battleTagError}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
