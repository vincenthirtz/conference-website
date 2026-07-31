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
import { PlayerAreaProvider } from '@/components/player/PlayerAreaContext';
import PlayerManageTeamScreen from '@/components/player/screens/PlayerManageTeamScreen';
import { withSubjectParam } from '@/utils/subjectParam';
import type { AdminUserProfilePayload } from '@/pages/api/admin/users/[userId]/profile';

import { logger } from '../../../../utils/logger';

type Dict = ReturnType<typeof useAdminT<'adminUserCaptainView'>>;

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

export const getServerSideProps = withStaffPage('admin');

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

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 px-6 py-10 text-center text-neutral-400">
      {children}
    </div>
  );
}

function CaptainViewPage({ staff: _staff }: { staff: StaffShape }) {
  const t = useAdminT('adminUserCaptainView');
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

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const json = await adminFetchJson<AdminUserProfilePayload>(
        `/api/admin/users/${encodeURIComponent(userId)}/profile`
      );
      setProfile(json);

      // Tranche d'équipe gérée par la CIBLE — même endpoint que son écran, lu
      // via `?as=`. Sert uniquement à alimenter les actions staff (promotion) ;
      // l'affichage du roster, lui, vient de l'écran réel monté plus bas.
      const slice = await adminFetchJson<ManagedTeamPayload>(
        withSubjectParam('/api/admin/teams/my', userId)
      ).catch((err) => {
        logger.error('[admin/captain-view] managed team error:', err);
        return null;
      });
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

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Back link + cross-link to the player view */}
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
                href={`/admin/users/${encodeURIComponent(userId)}/player-view`}
                className="inline-flex items-center gap-2 rounded-xl border border-neutral-700/60 bg-neutral-800/60 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-700/60 hover:text-white transition-colors"
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
              </Link>
            )}
          </div>

          {/* Banner */}
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

          {loading ? (
            <div className="space-y-4">
              <div className="h-12 rounded-xl bg-neutral-800/60 animate-pulse" />
              <div className="h-40 rounded-2xl bg-neutral-800/60 animate-pulse" />
            </div>
          ) : notFound ? (
            <EmptyState>
              <p className="text-lg font-semibold text-white">
                {t.notFoundTitle}
              </p>
              <p className="mt-2 text-sm">{t.notFoundDesc}</p>
            </EmptyState>
          ) : error ? (
            <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-100">
              {error}
            </div>
          ) : profile && userId ? (
            <>
              {/* Identity summary */}
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
                    <span className="font-semibold text-white">
                      {profile.user.displayName || t.noName}
                    </span>
                    {managed?.team && (
                      <p className="mt-1 text-sm text-neutral-400">
                        {managed.team.name}
                        <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-600/20 text-emerald-200 border border-emerald-500/30">
                          {managed.isCaptain
                            ? t.teamCaptainBadge
                            : t.teamManagerBadge}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {!managed?.team ? (
                <EmptyState>
                  <p className="text-lg font-semibold text-white">
                    {t.notCaptainTitle}
                  </p>
                  <p className="mt-2 text-sm">{t.notCaptainDesc}</p>
                </EmptyState>
              ) : (
                <>
                  {/* Actions staff — hors périmètre de l'UI capitaine */}
                  <section className="mb-6 rounded-2xl border border-neutral-700/50 bg-neutral-800/40 p-6">
                    <h2 className="text-xs uppercase tracking-wide text-neutral-500 mb-3">
                      {t.staffActionsTitle}
                    </h2>

                    {/* Promotion capitaine */}
                    <div className="mb-6">
                      <h3 className="text-sm font-medium text-white mb-2">
                        {t.promoteCaptainBtn}
                      </h3>
                      {promotableMembers.length === 0 ? (
                        <p className="text-sm text-neutral-500">
                          {t.noMembers}
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {promotableMembers.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => promoteMember(m)}
                              disabled={busy === `captain-${m.id}`}
                              className="px-3 py-2 rounded-xl bg-emerald-700/80 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-40"
                            >
                              {busy === `captain-${m.id}`
                                ? t.promoting
                                : m.display_name || m.battle_tag || t.noName}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Demandes d'adhésion en attente */}
                    <div>
                      <h3 className="text-sm font-medium text-white mb-2">
                        {t.tabJoinRequests}
                      </h3>
                      {joinRequests.length === 0 ? (
                        <p className="text-sm text-neutral-500">
                          {t.noJoinRequestsDesc}
                        </p>
                      ) : (
                        <div className="rounded-xl border border-neutral-700/50 divide-y divide-neutral-700/40">
                          {joinRequests.map((d) => (
                            <div
                              key={d.id}
                              className="flex flex-wrap items-center justify-between gap-3 p-3"
                            >
                              <div className="min-w-0">
                                <p className="text-sm text-white">
                                  {t.demandeTypeJoin}
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
                          ))}
                        </div>
                      )}
                    </div>
                  </section>

                  {/* L'écran capitaine réel, en lecture seule */}
                  <p className="mb-3 text-xs text-neutral-500">
                    {format(t.inspectionNotice, { name: headerName })}
                  </p>
                  <div className="overflow-hidden rounded-2xl border border-neutral-700/50">
                    <PlayerAreaProvider
                      subjectId={userId}
                      subjectName={headerName}
                    >
                      <PlayerManageTeamScreen />
                    </PlayerAreaProvider>
                  </div>
                </>
              )}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

export default CaptainViewPage;
