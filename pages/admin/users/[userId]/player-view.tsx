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

import Tabs from '@/components/ui/Tabs';
import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import {
  STAFF_ROLE_RANK,
  hasAtLeastRole,
  type StaffRole,
} from '@/utils/staffRoles';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import EntityHistoryButton from '@/components/admin/EntityHistoryButton';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import Modal from '@/components/ui/Modal';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import EmptyState from '@/components/ui/EmptyState';
import Chip from '@/features/admin/_shared/ui/Chip';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import {
  InspectionFrame,
  MODAL_FIELD_CLASS,
  MODAL_LABEL_CLASS,
  ModalActions,
  PanelHeading,
  PendingDemandesList,
  PlayerIdentitySummary,
  PlayerProfileFacts,
  PlayerViewBanner,
  roleChipTone,
} from '@/features/admin/users/ui/PlayerViewBlocks';
import { lazyPanel } from '@/components/admin/lazyPanel';
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
import AdminBreadcrumbs from '@/components/admin/AdminBreadcrumbs';

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
  return <Chip tone={roleChipTone(role)}>{roleLabel(t, role)}</Chip>;
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

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <div className="mx-auto w-full max-w-5xl">
          <AdminBreadcrumbs />
          {/* Back link + cross-link to the captain view */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/admin/users/manage"
              className="inline-flex items-center gap-2 text-sm text-[var(--t3,#a39ba6)] transition-colors hover:text-[var(--t1,#f4edf7)]"
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
              <AdminButtonLink
                href={`/admin/users/${encodeURIComponent(userId)}/captain-view`}
                size="sm"
              >
                {t.viewCaptainLink}
              </AdminButtonLink>
            )}
          </div>

          {/* Admin command-center banner */}
          <PlayerViewBanner name={headerName} />

          {/* States */}
          {loading ? (
            <div className="space-y-4">
              <div className="h-12 animate-pulse rounded-[var(--r-card,14px)] bg-[var(--s2,#1d1520)]" />
              <div className="h-40 animate-pulse rounded-[var(--r-card,14px)] bg-[var(--s2,#1d1520)]" />
              <div className="h-40 animate-pulse rounded-[var(--r-card,14px)] bg-[var(--s2,#1d1520)]" />
            </div>
          ) : notFound ? (
            <EmptyState title={t.notFoundTitle} description={t.notFoundDesc} />
          ) : error ? (
            <div className="rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.4)] bg-[rgba(255,107,107,.08)] px-5 py-4 text-sm text-[#ffc2c2]">
              {error}
            </div>
          ) : profile && userId ? (
            <>
              {/* Identity summary — quick glance, visible on every tab */}
              <PlayerIdentitySummary
                profile={profile}
                roleBadge={<RoleBadge t={t} role={profile.user.role} />}
                captainBadge={<Chip tone="ok">{t.teamRoleCaptain}</Chip>}
              />

              {/* ONGLETS — la primitive partagée. La version précédente
                  déclarait `role="tablist"` et `role="tab"` sans fournir ce
                  que ces rôles PROMETTENT : pas de flèches, pas de focus
                  roving, pas d'anneau de focus, et aucun `aria-controls` vers
                  le panneau. Annoncer « onglet 2 sur 5 » à qui appuie ensuite
                  sur une flèche sans effet est pire que de ne rien annoncer.
                  L'habillage rejoint au passage celui des autres barres de
                  l'espace admin. */}
              <Tabs
                tabs={getTabs(t).map((tab_) => ({
                  id: tab_.key,
                  label:
                    tab_.key === 'profil' && pendingDemandes.length > 0 ? (
                      <span className="flex items-center gap-2">
                        {tab_.label}
                        <Chip tone="warn">{pendingDemandes.length}</Chip>
                      </span>
                    ) : (
                      tab_.label
                    ),
                }))}
                active={tab}
                onChange={(id) => setTab(id as TabKey)}
                ariaLabel={t.tablistLabel}
                idBase="player-view"
                className="mb-6"
              />

              {/* Profil — identité + actions staff */}
              {tab === 'profil' && (
                <section
                  role="tabpanel"
                  className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6"
                >
                  <PlayerProfileFacts
                    profile={profile}
                    roleBadge={<RoleBadge t={t} role={profile.user.role} />}
                  />

                  {/* Actions staff */}
                  <div className="mt-6 border-t border-[var(--line,rgba(194,196,201,.12))] pt-6">
                    <PanelHeading>{t.actionsTitle}</PanelHeading>
                    <div className="flex flex-wrap gap-2">
                      {/* Lot A6 : l'historique se lit SUR la fiche. */}
                      {userId && (
                        <EntityHistoryButton
                          entityType="user"
                          entityId={userId}
                          className="inline-flex h-[38px] items-center rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] px-[14px] text-[12px] font-bold uppercase text-[var(--t2,#c7bfca)] transition-colors hover:border-[var(--t4,#807984)] hover:text-[var(--t1,#f4edf7)]"
                        />
                      )}

                      <AdminButton
                        size="sm"
                        onClick={() => {
                          setNameDraft(profile.user.displayName || '');
                          setEditingName(true);
                        }}
                      >
                        {t.editDisplayName}
                      </AdminButton>

                      <AdminButton
                        size="sm"
                        variant="secondary"
                        onClick={resendCredentials}
                        disabled={!profile.user.email || busy === 'resend'}
                      >
                        {busy === 'resend' ? t.sending : t.resendCredentials}
                      </AdminButton>

                      {profile.team && (
                        <>
                          <AdminButton
                            size="sm"
                            onClick={() => {
                              setTagDraft(profile.user.battleTag || '');
                              setTagError(null);
                              setEditingTag(true);
                            }}
                          >
                            {t.editBattleTag}
                          </AdminButton>

                          {profile.team.role !== 'captain' && (
                            <AdminButton
                              size="sm"
                              variant="secondary"
                              onClick={assignCaptain}
                              disabled={busy === 'captain'}
                            >
                              {busy === 'captain'
                                ? t.assigning
                                : t.assignCaptainBtn}
                            </AdminButton>
                          )}
                        </>
                      )}

                      <AdminButton
                        size="sm"
                        variant="secondary"
                        onClick={openTransfer}
                      >
                        {t.transferBtn}
                      </AdminButton>
                    </div>

                    {/* Role change — admin+ only, mirrors manage.tsx guards */}
                    {isAdmin && (
                      <div className="mt-4">
                        <label className={MODAL_LABEL_CLASS}>
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
                              className={`${MODAL_FIELD_CLASS} sm:w-auto`}
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
                  <div className="mt-6 border-t border-[var(--line,rgba(194,196,201,.12))] pt-6">
                    <PanelHeading>{t.pillPendingRequests}</PanelHeading>
                    <PendingDemandesList
                      demandes={pendingDemandes}
                      busy={busy}
                      onProcess={processDemande}
                    />
                  </div>
                </section>
              )}

              {/* Espace joueur — l'écran réel, en lecture seule */}
              {tab === 'espace' && (
                <InspectionFrame userId={userId} userName={headerName}>
                  <PlayerDashboardScreen />
                </InspectionFrame>
              )}

              {tab === 'matchs' && (
                <InspectionFrame userId={userId} userName={headerName}>
                  <PlayerMatchesScreen />
                </InspectionFrame>
              )}

              {tab === 'notifications' && (
                <InspectionFrame userId={userId} userName={headerName}>
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
          <ModalActions
            cancelLabel={t.cancel}
            confirmLabel={busy === 'name' ? t.saving : t.save}
            onCancel={() => setEditingName(false)}
            onConfirm={saveName}
            disabled={busy === 'name'}
          />
        }
      >
        <label className={MODAL_LABEL_CLASS}>{t.displayNameLabel}</label>
        <input
          type="text"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          className={MODAL_FIELD_CLASS}
          placeholder={t.displayNamePlaceholder}
        />
      </Modal>

      {/* Edit battle tag modal */}
      <Modal
        open={editingTag}
        onClose={() => setEditingTag(false)}
        title={t.editBattleTag}
        footer={
          <ModalActions
            cancelLabel={t.cancel}
            confirmLabel={busy === 'tag' ? t.saving : t.save}
            onCancel={() => setEditingTag(false)}
            onConfirm={saveBattleTag}
            disabled={busy === 'tag'}
          />
        }
      >
        <label className={MODAL_LABEL_CLASS}>{t.battleTagLabel}</label>
        <input
          type="text"
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          className={MODAL_FIELD_CLASS}
          placeholder={t.battleTagPlaceholder}
        />
        <p className="mt-1 text-xs text-[var(--t4,#807984)]">
          {t.battleTagHelp}
        </p>
        {tagError && (
          <div className="mt-3 rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.4)] bg-[rgba(255,107,107,.08)] px-3 py-2 text-sm text-[#ffc2c2]">
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
          <ModalActions
            cancelLabel={t.cancel}
            confirmLabel={
              busy === 'transfer' ? t.transferring : t.transferConfirmBtn
            }
            onCancel={() => setTransferOpen(false)}
            onConfirm={transferTeam}
            disabled={busy === 'transfer' || !transferTeamId}
          />
        }
      >
        <label className={MODAL_LABEL_CLASS}>{t.destTeamLabel}</label>
        {teamsLoading ? (
          <div className="flex items-center gap-2 py-2 text-sm text-[var(--t3,#a39ba6)]">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--t1,#f4edf7)]" />
            {t.loadingTeams}
          </div>
        ) : teamOptions.length === 0 ? (
          <p className="py-2 text-sm text-[var(--t4,#807984)]">
            {t.noOtherTeam}
          </p>
        ) : (
          <select
            aria-label={t.destTeamLabel}
            value={transferTeamId}
            onChange={(e) => setTransferTeamId(e.target.value)}
            className={MODAL_FIELD_CLASS}
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
