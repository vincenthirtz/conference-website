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
import { hasAtLeastRole, type StaffRole } from '@/utils/staffRoles';
import { useQueryClient } from '@tanstack/react-query';
import { AdminHttpError } from '@/utils/admin/adminHttp';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { useTeamOptions } from '@/features/admin/teams/hooks/useTeamsQueries';
import { usersClient } from '@/features/admin/users/client';
import {
  usersKeys,
  useUserProfile,
} from '@/features/admin/users/hooks/useUsersQueries';
import { demandesClient } from '@/features/admin/demandes/client';
import {
  useDemandesList,
  useInvalidateDemandes,
} from '@/features/admin/demandes/hooks/useDemandesQueries';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import EmptyState from '@/components/ui/EmptyState';
import Chip from '@/features/admin/_shared/ui/Chip';
import { AdminButtonLink } from '@/features/admin/_shared/ui/AdminButton';
import {
  InspectionFrame,
  PanelHeading,
  PendingDemandesList,
  PlayerIdentitySummary,
  PlayerProfileFacts,
  PlayerViewBanner,
} from '@/features/admin/users/ui/PlayerViewBlocks';
import PlayerViewStaffActions, {
  PlayerRoleBadge,
} from '@/features/admin/users/ui/PlayerViewStaffActions';
import {
  PlayerViewBattleTagModal,
  PlayerViewNameModal,
  PlayerViewTransferModal,
} from '@/features/admin/users/ui/PlayerViewModals';
import {
  canGrantRole,
  getTabs,
  isTargetProtected,
  roleLabel,
  type PendingDemande,
  type TabKey,
} from '@/features/admin/users/playerViewModel';
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

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

export const getServerSideProps = withStaffPage({ permission: 'manage_staff' });

function PlayerViewPage({ staff }: { staff: StaffShape }) {
  const t = useAdminT(nsAdminUserPlayerView);
  const router = useRouter();
  const rawUserId = router.query.userId;
  const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;

  const { addToast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  // Les deux lectures ne dépendent que de `userId` : en parallèle. Les
  // demandes restent BEST-EFFORT (leur échec ne casse pas la page) ; un
  // profil introuvable, lui, rend l'écran « introuvable ».
  const ready = router.isReady && !!userId;
  const profileQuery = useUserProfile(ready ? userId : undefined);
  // Demandes en attente de CETTE joueuse — endpoint admin filtrant, pas un
  // snapshot dédié : la modération reste un geste staff.
  const demandesQuery = useDemandesList<PendingDemande>(
    { userId, status: 'pending', includeTeam: true, limit: 20 },
    ready
  );
  const profile: AdminUserProfilePayload | null = profileQuery.data ?? null;
  const pendingDemandes: PendingDemande[] = demandesQuery.isError
    ? []
    : (demandesQuery.data ?? []);
  const profileError = profileQuery.error;
  const notFound =
    profileError instanceof AdminHttpError && profileError.status === 404;
  const error = profileError && !notFound ? t.loadError : null;
  const loading =
    !profileError && (profileQuery.isPending || demandesQuery.isPending);
  useEffect(() => {
    if (profileError)
      logger.error('[admin/player-view] load error:', profileError);
  }, [profileError]);
  useEffect(() => {
    if (demandesQuery.error)
      logger.error(
        '[admin/player-view] demandes load error:',
        demandesQuery.error
      );
  }, [demandesQuery.error]);
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
  // Liste d'équipes chargée paresseusement à l'ouverture, en cache partagé.
  const teamsQuery = useTeamOptions(500, transferOpen);
  const teamsLoading = teamsQuery.isFetching;
  const teamOptions = (teamsQuery.data?.teams ?? [])
    .filter((team) => team.id !== profile?.team?.id)
    .map((team) => ({ id: team.id, name: team.name }));
  const teamsError = teamsQuery.error;
  useEffect(() => {
    if (teamsError) addToast(teamsError.message || t.errLoadTeams, 'error');
  }, [teamsError, addToast, t.errLoadTeams]);
  const [transferTeamId, setTransferTeamId] = useState('');

  const isAdmin = hasAtLeastRole(staff.role as StaffRole, 'admin');

  const qc = useQueryClient();
  const invalidateDemandes = useInvalidateDemandes();
  /** Relit la fiche après un geste (profil + demandes). */
  const load = useCallback(async () => {
    if (!userId) return;
    await Promise.all([
      qc.invalidateQueries({ queryKey: usersKeys.profile(userId) }),
      invalidateDemandes(),
    ]);
  }, [qc, userId, invalidateDemandes]);

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
      await usersClient.patch({ userId, display_name: nameDraft.trim() });
      setEditingName(false);
      addToast(t.toastNameUpdated, 'success');
      await load();
    } catch (err) {
      addToast((err as Error)?.message || t.errUpdate, 'error');
    } finally {
      setBusy(null);
    }
  }, [userId, nameDraft, addToast, load, t]);

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
      const json = await usersClient.patch<{ warning?: string }>({
        userId,
        action: 'resend_credentials',
      });
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
  }, [userId, profile?.user.email, confirm, addToast, t]);

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
        await usersClient.patch({ userId, role });
        addToast(t.toastRoleUpdated, 'success');
        await load();
      } catch (err) {
        addToast((err as Error)?.message || t.errRoleUpdate, 'error');
      } finally {
        setBusy(null);
      }
    },
    [userId, profile, staff.role, confirm, addToast, load, t]
  );

  // PATCH /api/admin/users/manage — battle_tag (scoped to the player's team).
  const saveBattleTag = useCallback(async () => {
    if (!userId || !profile?.team) return;
    setBusy('tag');
    setTagError(null);
    try {
      await usersClient.patch({
        userId,
        teamId: profile.team.id,
        battleTag: tagDraft.trim(),
      });
      setEditingTag(false);
      addToast(t.toastBattleTagUpdated, 'success');
      await load();
    } catch (err) {
      setTagError((err as Error)?.message || t.errUnexpected);
    } finally {
      setBusy(null);
    }
  }, [userId, profile?.team, tagDraft, addToast, load, t]);

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
      await usersClient.action(userId, { action: 'assign_captain' });
      addToast(t.toastCaptainTransferred, 'success');
      await load();
    } catch (err) {
      addToast((err as Error)?.message || t.errCaptainAssign, 'error');
    } finally {
      setBusy(null);
    }
  }, [userId, profile?.team, headerName, confirm, addToast, load, t]);

  // Ouvre la modale de transfert — chargement paresseux de la liste d'équipes.
  const openTransfer = useCallback(() => {
    setTransferOpen(true);
    setTransferTeamId('');
  }, []);

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
      await usersClient.action(userId, {
        action: 'transfer_team',
        teamId: transferTeamId,
      });
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
        await demandesClient.updateStatus({ ids: [demandeId], newStatus });
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
    [confirm, addToast, load, t]
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
                roleBadge={<PlayerRoleBadge role={profile.user.role} />}
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
                    roleBadge={<PlayerRoleBadge role={profile.user.role} />}
                  />

                  <PlayerViewStaffActions
                    profile={profile}
                    userId={userId}
                    staffRole={staff.role}
                    isAdmin={isAdmin}
                    busy={busy}
                    onEditName={() => {
                      setNameDraft(profile.user.displayName || '');
                      setEditingName(true);
                    }}
                    onResendCredentials={resendCredentials}
                    onEditBattleTag={() => {
                      setTagDraft(profile.user.battleTag || '');
                      setTagError(null);
                      setEditingTag(true);
                    }}
                    onAssignCaptain={assignCaptain}
                    onOpenTransfer={openTransfer}
                    onChangeRole={changeRole}
                  />

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

      <PlayerViewNameModal
        open={editingName}
        busy={busy}
        draft={nameDraft}
        onDraftChange={setNameDraft}
        onClose={() => setEditingName(false)}
        onSave={saveName}
      />
      <PlayerViewBattleTagModal
        open={editingTag}
        busy={busy}
        draft={tagDraft}
        error={tagError}
        onDraftChange={setTagDraft}
        onClose={() => setEditingTag(false)}
        onSave={saveBattleTag}
      />
      <PlayerViewTransferModal
        open={transferOpen}
        busy={busy}
        teamsLoading={teamsLoading}
        teamOptions={teamOptions}
        teamId={transferTeamId}
        onTeamChange={setTransferTeamId}
        onClose={() => setTransferOpen(false)}
        onConfirm={transferTeam}
      />
    </>
  );
}

export default withAdminQuery(PlayerViewPage);
