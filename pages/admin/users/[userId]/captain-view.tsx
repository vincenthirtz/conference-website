// pages/admin/users/[userId]/captain-view.tsx
//
// Admin « Vue capitaine » — ce que gère une capitaine, plus ce que le staff
// peut faire par-dessus.
//
// Réécrite en S3 (docs/PLAN-espace-unifie.md) : l'ancienne page reproduisait
// l'espace capitaine (roster, demandes de join, scrims) à partir d'un
// endpoint-snapshot dédié de 395 lignes. Les deux ont disparu au profit du
// VRAI écran `PlayerManageTeamScreen`, monté en mode inspection — mêmes
// endpoints que la capitaine, `?as=<userId>`, aucune action.
//
// Ce qui reste ici est ce qu'aucune UI joueur n'offre :
//   - promouvoir un membre du roster capitaine (POST .../actions) ;
//   - modérer les demandes d'adhésion en attente (POST /api/admin/demandes).
//
// Identité de la cible : GET /api/admin/users/[userId]/profile.

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import EmptyState from '@/components/ui/EmptyState';
import Switch from '@/components/ui/Switch';
import { PlayerAreaProvider } from '@/components/player/PlayerAreaContext';
import PlayerManageTeamScreen from '@/components/player/screens/PlayerManageTeamScreen';
import { withSubjectParam } from '@/utils/subjectParam';
import type { AdminUserProfilePayload } from '@/pages/api/admin/users/[userId]/profile';

import { logger } from '../../../../utils/logger';
import nsAdminUserCaptainView from '@/lib/i18n/locales/admin-fr/adminUserCaptainView';
import AdminBreadcrumbs from '@/components/admin/AdminBreadcrumbs';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import { FicheSection } from '@/features/admin/_shared/ui/Fiche';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

export const getServerSideProps = withStaffPage({ permission: 'manage_staff' });

/** Membre tel que renvoyé par GET /api/admin/teams/my. */
type RosterMember = {
  id: string;
  user_id: string | null;
  display_name?: string | null;
  battle_tag?: string | null;
  role?: string | null;
  is_captain?: boolean | null;
  captain?: boolean | null;
};

type ManagedTeamPayload = {
  team: { id: string; name: string } | null;
  members: RosterMember[];
  isCaptain: boolean;
  isManager: boolean;
};

/** Demande telle que renvoyée par GET /api/admin/demandes. */
type PendingDemande = {
  id: string;
  type: string;
  status: string;
  created_at: string;
  comment?: string | null;
  payload?: Record<string, unknown> | null;
};

function initials(name: string | null, email: string | null): string {
  const source = (name || email || '?').trim();
  return source.slice(0, 2).toUpperCase();
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function CaptainViewPage({ staff: _staff }: { staff: StaffShape }) {
  const t = useAdminT(nsAdminUserCaptainView);
  const router = useRouter();
  const rawUserId = router.query.userId;
  const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;

  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const [profile, setProfile] = useState<AdminUserProfilePayload | null>(null);
  const [managed, setManaged] = useState<ManagedTeamPayload | null>(null);
  const [joinRequests, setJoinRequests] = useState<PendingDemande[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Agir à la place de la capitaine (S4). Volontairement NON persisté et
  // remis à false à chaque arrivée sur la page : ouvrir les écritures doit
  // rester un geste conscient, pas un état qu'on retrouve par surprise.
  const [actAs, setActAs] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      // Profil et tranche d'équipe ne dépendent tous deux que de `userId` :
      // en parallèle. Seules les demandes ci-dessous ont besoin du résultat
      // (l'id de l'équipe), et restent donc chaînées.
      const [json, slice] = await Promise.all([
        adminFetchJson<AdminUserProfilePayload>(
          `/api/admin/users/${encodeURIComponent(userId)}/profile`
        ),
        // Tranche d'équipe gérée par la CIBLE — même endpoint que son écran,
        // lu via `?as=`. Sert uniquement à alimenter les actions staff
        // (promotion) ; l'affichage du roster, lui, vient de l'écran réel
        // monté plus bas.
        adminFetchJson<ManagedTeamPayload>(
          withSubjectParam('/api/admin/teams/my', userId)
        ).catch((err) => {
          logger.error('[admin/captain-view] managed team error:', err);
          return null;
        }),
      ]);
      setProfile(json);
      setManaged(slice);

      if (slice?.team?.id) {
        const demandes = await adminFetchJson<{ demandes: PendingDemande[] }>(
          `/api/admin/demandes?teamId=${encodeURIComponent(slice.team.id)}&type=join&status=pending&limit=20`
        ).catch((err) => {
          logger.error('[admin/captain-view] demandes error:', err);
          return { demandes: [] };
        });
        setJoinRequests(demandes.demandes || []);
      } else {
        setJoinRequests([]);
      }
    } catch (err) {
      logger.error('[admin/captain-view] load error:', err);
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

  // POST /api/admin/users/[memberUserId]/actions — assign_captain. La cible est
  // le userId du MEMBRE promu, pas la capitaine courante.
  const promoteMember = useCallback(
    async (member: RosterMember) => {
      if (!member.user_id || !managed?.team) return;
      const memberName = member.display_name || member.battle_tag || t.noName;
      const ok = await confirm({
        title: t.confirmCaptainTitle,
        subtitle: format(t.confirmCaptainSubtitle, {
          name: memberName,
          team: managed.team.name,
        }),
        variant: 'warning',
        confirmLabel: t.confirmCaptainBtn,
      });
      if (!ok) return;
      setBusy(`captain-${member.id}`);
      try {
        await adminFetchJson(
          `/api/admin/users/${encodeURIComponent(member.user_id)}/actions`,
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
    },
    [managed?.team, confirm, adminFetchJson, addToast, load, t]
  );

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

  const promotableMembers = (managed?.members ?? []).filter(
    (m) => m.user_id && !(m.is_captain ?? m.captain)
  );

  return (
    <>
      {confirmDialog}
      <Head>
        <title>{format(t.headTitle, { name: headerName })}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <AdminBreadcrumbs />
        {/* Back link + cross-link to the player view */}
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
              href={`/admin/users/${encodeURIComponent(userId)}/player-view`}
              size="sm"
            >
              {t.viewPlayerLink}
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
            </AdminButtonLink>
          )}
        </div>

        {/* Banner */}
        <div
          role="status"
          className="mb-8 rounded-[var(--r-card,14px)] border border-emerald-500/40 bg-emerald-500/10 px-5 py-4"
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

        {loading ? (
          <div className="space-y-4">
            <div className="h-12 animate-pulse rounded-[var(--r-card,14px)] bg-[var(--s2,#1d1520)]" />
            <div className="h-40 animate-pulse rounded-[var(--r-card,14px)] bg-[var(--s2,#1d1520)]" />
          </div>
        ) : notFound ? (
          <EmptyState title={t.notFoundTitle} description={t.notFoundDesc} />
        ) : error ? (
          <div className="rounded-[var(--r-card,14px)] border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-100">
            {error}
          </div>
        ) : profile && userId ? (
          <>
            {/* Identity summary */}
            <div
              aria-label={t.identitySummaryLabel}
              className="mb-6 rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center gap-4">
                {profile.user.avatarUrl ? (
                  <Image
                    src={profile.user.avatarUrl}
                    alt=""
                    width={48}
                    height={48}
                    className="h-12 w-12 rounded-[var(--r-ctrl,4px)] border-l-[3px] border-[var(--or,#b467d1)] object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-[var(--r-ctrl,4px)] border-l-[3px] border-[var(--or,#b467d1)] bg-[var(--s3,#2f2732)] font-[family-name:var(--fd)] font-extrabold text-[var(--t1,#f4edf7)] [font-stretch:75%]">
                    {initials(profile.user.displayName, profile.user.email)}
                  </div>
                )}
                <div className="min-w-0">
                  <span className="font-semibold text-[var(--t1,#f4edf7)]">
                    {profile.user.displayName || t.noName}
                  </span>
                  {managed?.team && (
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--t3,#a39ba6)]">
                      {managed.team.name}
                      <Chip tone="ok">
                        {managed.isCaptain
                          ? t.teamCaptainBadge
                          : t.teamManagerBadge}
                      </Chip>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {!managed?.team ? (
              <EmptyState
                title={t.notCaptainTitle}
                description={t.notCaptainDesc}
              />
            ) : (
              <>
                {/* Actions staff — hors périmètre de l'UI capitaine */}
                <div className="mb-6">
                  <FicheSection eyebrow title={t.staffActionsTitle}>
                    {/* Bascule « agir en tant que » : rend l'écran capitaine
                          ci-dessous de nouveau actionnable. */}
                    <div className="mb-6 flex items-start justify-between gap-4 rounded-[var(--r-ctrl,4px)] border border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.06)] px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#ffd9a3]">
                          {t.actAsToggleLabel}
                        </p>
                        <p className="mt-0.5 text-xs text-[#ffd9a3]/70">
                          {format(t.actAsToggleHelp, { name: headerName })}
                        </p>
                      </div>
                      <Switch
                        checked={actAs}
                        onChange={() => setActAs((v) => !v)}
                        label={t.actAsToggleLabel}
                        size="md"
                        tone="amber"
                      />
                    </div>

                    {/* Promotion capitaine */}
                    <div className="mb-6">
                      <h3 className="mb-2 text-sm font-medium text-[var(--t1,#f4edf7)]">
                        {t.promoteCaptainBtn}
                      </h3>
                      {promotableMembers.length === 0 ? (
                        <p className="text-sm text-[var(--t4,#807984)]">
                          {t.noMembers}
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {promotableMembers.map((m) => (
                            <AdminButton
                              key={m.id}
                              size="sm"
                              variant="secondary"
                              onClick={() => promoteMember(m)}
                              disabled={busy === `captain-${m.id}`}
                            >
                              {busy === `captain-${m.id}`
                                ? t.promoting
                                : m.display_name || m.battle_tag || t.noName}
                            </AdminButton>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Demandes d'adhésion en attente */}
                    <div>
                      <h3 className="mb-2 text-sm font-medium text-[var(--t1,#f4edf7)]">
                        {t.tabJoinRequests}
                      </h3>
                      {joinRequests.length === 0 ? (
                        <p className="text-sm text-[var(--t4,#807984)]">
                          {t.noJoinRequestsDesc}
                        </p>
                      ) : (
                        <div className="divide-y divide-[var(--line,rgba(194,196,201,.12))] rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))]">
                          {joinRequests.map((d) => (
                            <div
                              key={d.id}
                              className="flex flex-wrap items-center justify-between gap-3 p-3"
                            >
                              <div className="min-w-0">
                                <p className="text-sm text-[var(--t1,#f4edf7)]">
                                  {t.demandeTypeJoin}
                                </p>
                                <p className="font-mono text-xs text-[var(--t3,#a39ba6)]">
                                  {formatDate(d.created_at)}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <AdminButton
                                  size="xs"
                                  variant="secondary"
                                  onClick={() =>
                                    processDemande(d.id, 'approved')
                                  }
                                  disabled={busy === `demande-${d.id}`}
                                >
                                  {t.approve}
                                </AdminButton>
                                <AdminButton
                                  size="xs"
                                  variant="danger"
                                  onClick={() =>
                                    processDemande(d.id, 'rejected')
                                  }
                                  disabled={busy === `demande-${d.id}`}
                                >
                                  {t.reject}
                                </AdminButton>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </FicheSection>
                </div>

                {/* L'écran capitaine réel — consultable, et actionnable
                      seulement si le staff a basculé « agir en tant que ». */}
                <p
                  className={`mb-3 text-xs ${
                    actAs
                      ? 'font-medium text-[#ffd9a3]'
                      : 'text-[var(--t4,#807984)]'
                  }`}
                >
                  {format(actAs ? t.actAsNotice : t.inspectionNotice, {
                    name: headerName,
                  })}
                </p>
                <div
                  className={`overflow-hidden rounded-[var(--r-card,14px)] border ${
                    actAs
                      ? 'border-[rgba(245,165,36,.45)]'
                      : 'border-[var(--line2,rgba(194,196,201,.2))]'
                  }`}
                >
                  <PlayerAreaProvider
                    subjectId={userId}
                    subjectName={headerName}
                    actAs={actAs}
                  >
                    <PlayerManageTeamScreen />
                  </PlayerAreaProvider>
                </div>
              </>
            )}
          </>
        ) : null}
      </div>
    </>
  );
}

export default CaptainViewPage;
