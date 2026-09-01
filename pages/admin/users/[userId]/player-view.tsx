// pages/admin/users/[userId]/player-view.tsx
//
// Admin « Vue player » — poste de commande par joueuse.
//
// Deux moitiés, désormais bien séparées (S3 de docs/PLAN-espace-unifie.md) :
//
//   1. Ce que seul le staff peut faire : identité du compte, changement de
//      rôle, renvoi d'identifiants, BattleTag, capitanat, transfert d'équipe,
//      modération des demandes. Ça reste ici, câblé sur les endpoints admin
//      existants, et c'est audité.
//
//   2. Ce que voit la joueuse : plus AUCUNE copie. On monte les VRAIS écrans
//      joueur (`components/player/screens/*`) dans un PlayerAreaProvider en
//      mode inspection — chaque lecture part vers `/api/player/*?as=<userId>`
//      et chaque bouton d'action disparaît. L'ancien miroir (une page de
//      1 600 lignes adossée à un endpoint-snapshot de 518 lignes qui
//      reproduisait à la main les shapes de 4 endpoints joueur) est supprimé :
//      il ne pouvait que diverger.
//
// Identité de la cible : GET /api/admin/users/[userId]/profile (métadonnées
// auth — rien qu'un endpoint joueur n'expose).
// Page gated 'admin' ; le changement de rôle applique les mêmes garde-fous que
// manage.tsx (le serveur les revérifie).

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import {
  withStaffPage,
  STAFF_ROLE_RANK,
  hasAtLeastRole,
  type StaffRole,
} from '@/utils/staff';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import EntityHistoryButton from '@/components/admin/EntityHistoryButton';
import {
  formatDate,
  getDemandeTypeLabels,
  initials,
  roleTone,
} from '@/components/admin/users/playerViewDisplay';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import Modal from '@/components/ui/Modal';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import EmptyState from '@/components/ui/EmptyState';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import { lazyPanel } from '@/components/admin/lazyPanel';
import { PlayerAreaProvider } from '@/components/player/PlayerAreaContext';
// Les trois écrans de l'espace joueur sont montés UN À LA FOIS, et jamais sur
// l'onglet par défaut ('profil') : les importer statiquement faisait de cette
// page le plus gros bundle admin après /admin/logs. Chargement à l'ouverture
// de l'onglet — `ssr:false`, ils lisent leurs données côté client de toute
// façon (page noindex).
const PlayerDashboardScreen = lazyPanel(
  () => import('@/components/player/screens/PlayerDashboardScreen')
);
const PlayerMatchesScreen = lazyPanel(
  () => import('@/components/player/screens/PlayerMatchesScreen')
);
const PlayerNotificationsScreen = lazyPanel(
  () => import('@/components/player/screens/PlayerNotificationsScreen')
);
import type { AdminUserProfilePayload } from '@/pages/api/admin/users/[userId]/profile';

import { logger } from '../../../../utils/logger';
import nsAdminUserPlayerView from '@/lib/i18n/locales/admin-fr/adminUserPlayerView';

type Dict = typeof nsAdminUserPlayerView.fr;

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

export const getServerSideProps = withStaffPage({ permission: 'manage_staff' });

/* ----------------------------------------------------------------------- */
/* Role helpers — mirror manage.tsx so the UI never offers a forbidden      */
/* change (the API enforces the same guards too).                           */
/* ----------------------------------------------------------------------- */

const ROLE_OPTIONS = ['member', 'player', 'caster', 'admin', 'owner'];

function roleLabel(t: Dict, role: string | null): string {
  switch ((role || '').toLowerCase()) {
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
    default:
      return t.roleMember;
  }
}

/** Un compte owner/admin ne se touche qu'en owner. */
function isTargetProtected(targetRole: string | null): boolean {
  const r = (targetRole || '').toLowerCase();
  return r === 'owner' || r === 'admin';
}

/** Pas d'octroi d'un rôle supérieur ou égal au sien. */
function canGrantRole(requesterRole: string | null, role: string): boolean {
  const requesterRank = STAFF_ROLE_RANK[requesterRole as StaffRole] ?? 0;
  const targetRank = STAFF_ROLE_RANK[role as StaffRole] ?? 0;
  if (targetRank === 0) return true; // member / player : pas un rôle staff
  return requesterRank > targetRank || requesterRole === 'owner';
}

type TabKey = 'profil' | 'espace' | 'matchs' | 'notifications';

function getTabs(t: Dict): Array<{ key: TabKey; label: string }> {
  return [
    { key: 'profil', label: t.tabProfil },
    { key: 'espace', label: t.tabEspace },
    { key: 'matchs', label: t.tabMatchs },
    { key: 'notifications', label: t.tabNotifications },
  ];
}

/** Demande telle que renvoyée par GET /api/admin/demandes. */
type PendingDemande = {
  id: string;
  type: string;
  status: string;
  created_at: string;
  comment?: string | null;
  team?: { id: string; name: string } | null;
};

function RoleBadge({ t, role }: { t: Dict; role: string | null }) {
  return <Badge tone={roleTone(role)}>{roleLabel(t, role)}</Badge>;
}

/**
 * Cadre d'inspection : le vrai écran joueur, rendu tel quel.
 *
 * Les écrans posent leur propre fond plein écran (c'est le décor de l'espace
 * joueur) ; on les enferme dans un conteneur pour que la page admin garde ses
 * marges et que la frontière « ici c'est SA page » reste visible.
 */
function InspectionFrame({
  t,
  userId,
  userName,
  children,
}: {
  t: Dict;
  userId: string;
  userName: string;
  children: React.ReactNode;
}) {
  return (
    <section role="tabpanel">
      <p className="mb-3 text-xs text-neutral-500">
        {format(t.inspectionNotice, { name: userName })}
      </p>
      <div className="overflow-hidden rounded-2xl border border-neutral-700/50">
        <PlayerAreaProvider subjectId={userId} subjectName={userName}>
          {children}
        </PlayerAreaProvider>
      </div>
    </section>
  );
}

function PlayerViewPage({ staff }: { staff: StaffShape }) {
  const t = useAdminT(nsAdminUserPlayerView);
  const router = useRouter();
  const rawUserId = router.query.userId;
  const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;

  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [profile, setProfile] = useState<AdminUserProfilePayload | null>(null);
  const [pendingDemandes, setPendingDemandes] = useState<PendingDemande[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<TabKey>('profil');

  // Per-action busy flags (keep buttons from double-submitting).
  const [busy, setBusy] = useState<string | null>(null);

  // Edit display name modal.
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  // Edit battle tag modal.
  const [editingTag, setEditingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);

  // Transfer-to-team modal.
  const [transferOpen, setTransferOpen] = useState(false);
  const [teamOptions, setTeamOptions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [transferTeamId, setTransferTeamId] = useState('');

  const isAdmin = hasAtLeastRole(staff.role as StaffRole, 'admin');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      // Les deux lectures ne dépendent que de `userId` : les enchaîner faisait
      // payer deux allers-retours au chargement de la fiche. En parallèle.
      // Les demandes restent BEST-EFFORT (leur échec ne casse pas la page),
      // d'où le `.catch` sur la seule promesse concernée plutôt qu'un
      // `Promise.allSettled` qui masquerait aussi un profil introuvable.
      const [json, demandes] = await Promise.all([
        adminFetchJson<AdminUserProfilePayload>(
          `/api/admin/users/${encodeURIComponent(userId)}/profile`
        ),
        // Demandes en attente de CETTE joueuse — endpoint admin filtrant, pas
        // un snapshot dédié : la modération reste un geste staff.
        adminFetchJson<{ demandes: PendingDemande[] }>(
          `/api/admin/demandes?userId=${encodeURIComponent(userId)}&status=pending&includeTeam=1&limit=20`
        ).catch((demandeErr) => {
          logger.error('[admin/player-view] demandes load error:', demandeErr);
          return { demandes: [] as PendingDemande[] };
        }),
      ]);
      setProfile(json);
      setPendingDemandes(demandes.demandes || []);
    } catch (err) {
      logger.error('[admin/player-view] load error:', err);
      if (err instanceof AdminFetchError && err.status === 404) {
        setNotFound(true);
      } else {
        setError(t.loadError);
      }
    } finally {
      setLoading(false);
    }
  }, [userId, adminFetchJson, t]);

  useEffect(() => {
    if (!router.isReady) return;
    load();
  }, [router.isReady, load]);

  const headerName =
    profile?.user.displayName || profile?.user.email || t.defaultUser;

  /* --------------------------------------------------------------------- */
  /* Actions — chacune réutilise un endpoint admin existant puis recharge   */
  /* --------------------------------------------------------------------- */

  // PATCH /api/admin/users/manage — display_name.
  const saveName = useCallback(async () => {
    if (!userId) return;
    setBusy('name');
    try {
      await adminFetchJson('/api/admin/users/manage', {
        method: 'PATCH',
        body: JSON.stringify({ userId, display_name: nameDraft.trim() }),
      });
      setEditingName(false);
      addToast(t.toastNameUpdated, 'success');
      await load();
    } catch (err) {
      addToast((err as Error)?.message || t.errUpdate, 'error');
    } finally {
      setBusy(null);
    }
  }, [userId, nameDraft, adminFetchJson, addToast, load, t]);

  // PATCH /api/admin/users/manage — resend_credentials.
  const resendCredentials = useCallback(async () => {
    if (!userId || !profile?.user.email) return;
    const ok = await confirm({
      title: t.confirmResendTitle,
      subtitle: format(t.confirmResendSubtitle, { email: profile.user.email }),
      variant: 'warning',
      confirmLabel: t.confirmSend,
    });
    if (!ok) return;
    setBusy('resend');
    try {
      const json = await adminFetchJson<{ warning?: string }>(
        '/api/admin/users/manage',
        {
          method: 'PATCH',
          body: JSON.stringify({ userId, action: 'resend_credentials' }),
        }
      );
      if (json.warning) addToast(json.warning, 'warning');
      else
        addToast(
          format(t.toastCredentialsSent, { email: profile.user.email }),
          'success'
        );
    } catch (err) {
      addToast((err as Error)?.message || t.errSend, 'error');
    } finally {
      setBusy(null);
    }
  }, [userId, profile?.user.email, confirm, adminFetchJson, addToast, t]);

  // PATCH /api/admin/users/manage — role.
  const changeRole = useCallback(
    async (role: string) => {
      if (!userId || !profile) return;
      const previousRole = profile.user.role ?? null;
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

      setBusy('role');
      try {
        await adminFetchJson('/api/admin/users/manage', {
          method: 'PATCH',
          body: JSON.stringify({ userId, role }),
        });
        addToast(t.toastRoleUpdated, 'success');
        await load();
      } catch (err) {
        addToast((err as Error)?.message || t.errRoleUpdate, 'error');
      } finally {
        setBusy(null);
      }
    },
    [userId, profile, staff.role, confirm, adminFetchJson, addToast, load, t]
  );

  // PATCH /api/admin/users/manage — battle_tag (scoped to the player's team).
  const saveBattleTag = useCallback(async () => {
    if (!userId || !profile?.team) return;
    setBusy('tag');
    setTagError(null);
    try {
      await adminFetchJson('/api/admin/users/manage', {
        method: 'PATCH',
        body: JSON.stringify({
          userId,
          teamId: profile.team.id,
          battleTag: tagDraft.trim(),
        }),
      });
      setEditingTag(false);
      addToast(t.toastBattleTagUpdated, 'success');
      await load();
    } catch (err) {
      setTagError((err as Error)?.message || t.errUnexpected);
    } finally {
      setBusy(null);
    }
  }, [userId, profile?.team, tagDraft, adminFetchJson, addToast, load, t]);

  // POST /api/admin/users/[userId]/actions — assign_captain.
  const assignCaptain = useCallback(async () => {
    if (!userId || !profile?.team) return;
    const ok = await confirm({
      title: t.confirmCaptainTitle,
      subtitle: format(t.confirmCaptainSubtitle, {
        name: headerName,
        team: profile.team.name,
      }),
      variant: 'warning',
      confirmLabel: t.confirmCaptainBtn,
    });
    if (!ok) return;
    setBusy('captain');
    try {
      await adminFetchJson(
        `/api/admin/users/${encodeURIComponent(userId)}/actions`,
        {
          method: 'POST',
          body: JSON.stringify({ action: 'assign_captain' }),
        }
      );
      addToast(t.toastCaptainTransferred, 'success');
      await load();
    } catch (err) {
      addToast((err as Error)?.message || t.errCaptainAssign, 'error');
    } finally {
      setBusy(null);
    }
  }, [
    userId,
    profile?.team,
    headerName,
    confirm,
    adminFetchJson,
    addToast,
    load,
    t,
  ]);

  // Ouvre la modale de transfert — chargement paresseux de la liste d'équipes.
  const openTransfer = useCallback(async () => {
    setTransferOpen(true);
    setTransferTeamId('');
    setTeamsLoading(true);
    try {
      const json = await adminFetchJson<{
        teams: Array<{ id: string; name: string }>;
      }>('/api/admin/teams?limit=500');
      const list = (json.teams || [])
        .filter((team) => team.id !== profile?.team?.id)
        .map((team) => ({ id: team.id, name: team.name }));
      setTeamOptions(list);
    } catch (err) {
      addToast((err as Error)?.message || t.errLoadTeams, 'error');
    } finally {
      setTeamsLoading(false);
    }
  }, [adminFetchJson, addToast, profile?.team?.id, t]);

  // POST /api/admin/users/[userId]/actions — transfer_team.
  const transferTeam = useCallback(async () => {
    if (!userId || !transferTeamId) return;
    const target = teamOptions.find((team) => team.id === transferTeamId);
    const ok = await confirm({
      title: t.confirmTransferTitle,
      subtitle: format(t.confirmTransferSubtitle, {
        name: headerName,
        team: target?.name ?? t.thisTeam,
      }),
      variant: 'warning',
      confirmLabel: t.transferConfirmBtn,
    });
    if (!ok) return;
    setBusy('transfer');
    try {
      await adminFetchJson(
        `/api/admin/users/${encodeURIComponent(userId)}/actions`,
        {
          method: 'POST',
          body: JSON.stringify({
            action: 'transfer_team',
            teamId: transferTeamId,
          }),
        }
      );
      setTransferOpen(false);
      addToast(t.toastPlayerTransferred, 'success');
      await load();
    } catch (err) {
      addToast((err as Error)?.message || t.errTransfer, 'error');
    } finally {
      setBusy(null);
    }
  }, [
    userId,
    transferTeamId,
    teamOptions,
    headerName,
    confirm,
    adminFetchJson,
    addToast,
    load,
    t,
  ]);

  // POST /api/admin/demandes — approve / reject.
  const processDemande = useCallback(
    async (demandeId: string, newStatus: 'approved' | 'rejected') => {
      const verb = newStatus === 'approved' ? t.verbApprove : t.verbReject;
      const ok = await confirm({
        title: format(t.confirmDemandeTitle, { verb }),
        variant: newStatus === 'approved' ? 'info' : 'warning',
        confirmLabel: verb,
      });
      if (!ok) return;
      setBusy(`demande-${demandeId}`);
      try {
        await adminFetchJson('/api/admin/demandes', {
          method: 'POST',
          body: JSON.stringify({
            action: 'updateStatus',
            demandeIds: [demandeId],
            newStatus,
          }),
        });
        addToast(
          newStatus === 'approved'
            ? t.toastDemandeApproved
            : t.toastDemandeRejected,
          'success'
        );
        await load();
      } catch (err) {
        addToast((err as Error)?.message || t.errDemandeProcess, 'error');
      } finally {
        setBusy(null);
      }
    },
    [confirm, adminFetchJson, addToast, load, t]
  );

  return (
    <>
      {confirmDialog}
      <Head>
        <title>{format(t.headTitle, { name: headerName })}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Back link + cross-link to the captain view */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/admin/users/manage"
              className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
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
              {t.backLink}
            </Link>
            {userId && (
              <Link
                href={`/admin/users/${encodeURIComponent(userId)}/captain-view`}
                className="inline-flex items-center gap-2 rounded-xl border border-neutral-700/60 bg-neutral-800/60 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-700/60 hover:text-white transition-colors"
              >
                {t.viewCaptainLink}
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
              </Link>
            )}
          </div>

          {/* Admin command-center banner */}
          <div
            role="status"
            className="mb-8 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-4"
          >
            <div className="flex items-start gap-3">
              <svg
                className="w-6 h-6 text-emerald-300 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <h1 className="text-lg md:text-xl font-bold text-emerald-100">
                  {format(t.bannerTitle, { name: headerName })}
                </h1>
                <p className="text-sm text-emerald-100/80 mt-1">
                  {t.bannerDescBefore}
                  <strong>{t.bannerDescStrong}</strong>
                  {t.bannerDescAfter}
                </p>
              </div>
            </div>
          </div>

          {/* States */}
          {loading ? (
            <div className="space-y-4">
              <div className="h-12 rounded-xl bg-neutral-800/60 animate-pulse" />
              <div className="h-40 rounded-2xl bg-neutral-800/60 animate-pulse" />
              <div className="h-40 rounded-2xl bg-neutral-800/60 animate-pulse" />
            </div>
          ) : notFound ? (
            <EmptyState title={t.notFoundTitle} description={t.notFoundDesc} />
          ) : error ? (
            <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-100">
              {error}
            </div>
          ) : profile && userId ? (
            <>
              {/* Identity summary — quick glance, visible on every tab */}
              <div
                aria-label={t.identitySummaryLabel}
                className="mb-6 rounded-2xl border border-neutral-700/60 bg-neutral-800/40 p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-center gap-4">
                  {profile.user.avatarUrl ? (
                    <Image
                      src={profile.user.avatarUrl}
                      alt=""
                      width={48}
                      height={48}
                      className="w-12 h-12 rounded-xl object-cover border border-neutral-700"
                      unoptimized
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center font-bold text-emerald-200">
                      {initials(profile.user.displayName, profile.user.email)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white truncate">
                        {profile.user.displayName || t.noName}
                      </span>
                      <RoleBadge t={t} role={profile.user.role} />
                    </div>
                    {profile.team && (
                      <p className="mt-1 text-sm text-neutral-400">
                        {profile.team.name}
                        {profile.team.role === 'captain' && (
                          <Badge tone="emerald" className="ml-2">
                            {t.teamRoleCaptain}
                          </Badge>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div
                role="tablist"
                aria-label={t.tablistLabel}
                className="flex flex-wrap gap-2 mb-6 border-b border-neutral-700/50 pb-3"
              >
                {getTabs(t).map((tab_) => {
                  const active = tab === tab_.key;
                  const badge =
                    tab_.key === 'profil' && pendingDemandes.length > 0
                      ? pendingDemandes.length
                      : null;
                  return (
                    <button
                      key={tab_.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setTab(tab_.key)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                        active
                          ? 'bg-emerald-600 text-white'
                          : 'bg-neutral-800/60 text-neutral-300 hover:bg-neutral-700/60'
                      }`}
                    >
                      {tab_.label}
                      {badge !== null && (
                        <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500 text-[10px] font-bold text-neutral-900">
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Profil — identité + actions staff */}
              {tab === 'profil' && (
                <section
                  role="tabpanel"
                  className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 p-6"
                >
                  <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-neutral-500">
                        {t.fieldEmail}
                      </dt>
                      <dd className="text-sm text-white break-all">
                        {profile.user.email || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-neutral-500">
                        {t.fieldRole}
                      </dt>
                      <dd className="mt-1">
                        <RoleBadge t={t} role={profile.user.role} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-neutral-500">
                        {t.fieldBattleTag}
                      </dt>
                      <dd className="text-sm text-white font-mono">
                        {profile.user.battleTag || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-neutral-500">
                        {t.fieldRegisteredOn}
                      </dt>
                      <dd className="text-sm text-white">
                        {formatDate(profile.user.createdAt)}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs uppercase tracking-wide text-neutral-500">
                        {t.fieldId}
                      </dt>
                      <dd className="text-xs text-neutral-400 font-mono break-all">
                        {profile.user.id}
                      </dd>
                    </div>
                  </dl>

                  {/* Actions staff */}
                  <div className="mt-6 pt-6 border-t border-neutral-700/50">
                    <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-3">
                      {t.actionsTitle}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {/* Lot A6 : l'historique se lit SUR la fiche. */}
                      {userId && (
                        <EntityHistoryButton
                          entityType="user"
                          entityId={userId}
                          className="px-3 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-medium transition-colors"
                        />
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setNameDraft(profile.user.displayName || '');
                          setEditingName(true);
                        }}
                        className="px-3 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
                      >
                        {t.editDisplayName}
                      </button>

                      <button
                        type="button"
                        onClick={resendCredentials}
                        disabled={!profile.user.email || busy === 'resend'}
                        className="px-3 py-2 rounded-xl bg-amber-600/80 hover:bg-amber-600 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {busy === 'resend' ? t.sending : t.resendCredentials}
                      </button>

                      {profile.team && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setTagDraft(profile.user.battleTag || '');
                              setTagError(null);
                              setEditingTag(true);
                            }}
                            className="px-3 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
                          >
                            {t.editBattleTag}
                          </button>

                          {profile.team.role !== 'captain' && (
                            <button
                              type="button"
                              onClick={assignCaptain}
                              disabled={busy === 'captain'}
                              className="px-3 py-2 rounded-xl bg-emerald-700/80 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {busy === 'captain'
                                ? t.assigning
                                : t.assignCaptainBtn}
                            </button>
                          )}
                        </>
                      )}

                      <button
                        type="button"
                        onClick={openTransfer}
                        className="px-3 py-2 rounded-xl bg-blue-700/80 hover:bg-blue-700 text-sm font-medium transition-colors"
                      >
                        {t.transferBtn}
                      </button>
                    </div>

                    {/* Role change — admin+ only, mirrors manage.tsx guards */}
                    {isAdmin && (
                      <div className="mt-4">
                        <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
                          {t.fieldRole}
                        </label>
                        {(() => {
                          const targetLocked =
                            isTargetProtected(profile.user.role) &&
                            staff.role !== 'owner';
                          return (
                            <select
                              aria-label={t.roleSelectAria}
                              value={(
                                profile.user.role || 'member'
                              ).toLowerCase()}
                              onChange={(e) => changeRole(e.target.value)}
                              disabled={busy === 'role' || targetLocked}
                              title={targetLocked ? t.errOwnerOnly : undefined}
                              className="px-3 py-2 rounded-xl bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {ROLE_OPTIONS.map((r) => {
                                const grantable =
                                  r ===
                                    (
                                      profile.user.role || 'member'
                                    ).toLowerCase() ||
                                  canGrantRole(staff.role, r);
                                return (
                                  <option
                                    key={r}
                                    value={r}
                                    disabled={!grantable}
                                  >
                                    {roleLabel(t, r)}
                                  </option>
                                );
                              })}
                            </select>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Demandes en attente — modération (geste staff, pas une
                      lecture de l'espace joueur). */}
                  <div className="mt-6 pt-6 border-t border-neutral-700/50">
                    <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-3">
                      {t.pillPendingRequests}
                    </h3>
                    {pendingDemandes.length === 0 ? (
                      <p className="text-sm text-neutral-500">
                        {t.noDemandeDesc}
                      </p>
                    ) : (
                      <div className="rounded-xl border border-neutral-700/50 divide-y divide-neutral-700/40">
                        {pendingDemandes.map((d) => {
                          const typeLabels = getDemandeTypeLabels(t);
                          return (
                            <div
                              key={d.id}
                              className="flex flex-wrap items-center justify-between gap-3 p-3"
                            >
                              <div className="min-w-0">
                                <p className="text-sm text-white">
                                  {typeLabels[d.type] || t.demandeTypeOther}
                                  {d.team?.name && (
                                    <span className="text-neutral-400">
                                      {' · '}
                                      {d.team.name}
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-neutral-500">
                                  {formatDate(d.created_at)}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    processDemande(d.id, 'approved')
                                  }
                                  disabled={busy === `demande-${d.id}`}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold transition-colors disabled:opacity-50"
                                >
                                  {t.approve}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    processDemande(d.id, 'rejected')
                                  }
                                  disabled={busy === `demande-${d.id}`}
                                  className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-semibold transition-colors disabled:opacity-50"
                                >
                                  {t.reject}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Espace joueur — l'écran réel, en lecture seule */}
              {tab === 'espace' && (
                <InspectionFrame t={t} userId={userId} userName={headerName}>
                  <PlayerDashboardScreen />
                </InspectionFrame>
              )}

              {tab === 'matchs' && (
                <InspectionFrame t={t} userId={userId} userName={headerName}>
                  <PlayerMatchesScreen />
                </InspectionFrame>
              )}

              {tab === 'notifications' && (
                <InspectionFrame t={t} userId={userId} userName={headerName}>
                  <PlayerNotificationsScreen />
                </InspectionFrame>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Edit display name modal */}
      <Modal
        open={editingName}
        onClose={() => setEditingName(false)}
        title={t.editDisplayName}
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditingName(false)}
              className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={saveName}
              disabled={busy === 'name'}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === 'name' ? t.saving : t.save}
            </button>
          </>
        }
      >
        <label className="block text-sm text-neutral-400 mb-1">
          {t.displayNameLabel}
        </label>
        <input
          type="text"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
          placeholder={t.displayNamePlaceholder}
        />
      </Modal>

      {/* Edit battle tag modal */}
      <Modal
        open={editingTag}
        onClose={() => setEditingTag(false)}
        title={t.editBattleTag}
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditingTag(false)}
              className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={saveBattleTag}
              disabled={busy === 'tag'}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === 'tag' ? t.saving : t.save}
            </button>
          </>
        }
      >
        <label className="block text-sm text-neutral-400 mb-1">
          {t.battleTagLabel}
        </label>
        <input
          type="text"
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
          placeholder={t.battleTagPlaceholder}
        />
        <p className="text-xs text-neutral-500 mt-1">{t.battleTagHelp}</p>
        {tagError && (
          <div className="mt-3 rounded-lg bg-red-900/40 border border-red-500/50 px-3 py-2 text-sm text-red-200">
            {tagError}
          </div>
        )}
      </Modal>

      {/* Transfer team modal */}
      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title={t.transferModalTitle}
        footer={
          <>
            <button
              type="button"
              onClick={() => setTransferOpen(false)}
              className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={transferTeam}
              disabled={busy === 'transfer' || !transferTeamId}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === 'transfer' ? t.transferring : t.transferConfirmBtn}
            </button>
          </>
        }
      >
        <label className="block text-sm text-neutral-400 mb-1">
          {t.destTeamLabel}
        </label>
        {teamsLoading ? (
          <div className="flex items-center gap-2 text-sm text-neutral-400 py-2">
            <div className="w-4 h-4 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            {t.loadingTeams}
          </div>
        ) : teamOptions.length === 0 ? (
          <p className="text-sm text-neutral-500 py-2">{t.noOtherTeam}</p>
        ) : (
          <select
            aria-label={t.destTeamLabel}
            value={transferTeamId}
            onChange={(e) => setTransferTeamId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
          >
            <option value="">{t.selectTeam}</option>
            {teamOptions.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        )}
      </Modal>
    </>
  );
}

export default PlayerViewPage;
