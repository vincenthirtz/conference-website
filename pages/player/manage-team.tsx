// pages/player/manage-team.tsx
// Page de gestion d'equipe pour le capitaine

import { useEffect, useState, useCallback, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useManagedTeam } from '@/hooks/useManagedTeam';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import CopyButton from '@/components/player/CopyButton';
import { useT, format } from '@/lib/i18n/useT';
import { useLang } from '@/lib/i18n/LanguageProvider';

type Specialty = 'tank' | 'dps' | 'support' | 'flex' | null;

type Member = {
  id: string;
  user_id: string | null;
  role: string | null;
  battle_tag: string | null;
  is_substitute: boolean;
  is_captain?: boolean;
  specialty?: Specialty;
};

type TeamInfo = {
  id: string;
  slug?: string | null;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  country: string | null;
  description: string | null;
  is_joinable?: boolean;
};

type JoinRequest = {
  id: string;
  user_id: string;
  status: string;
  comment: string | null;
  payload: {
    user_display_name?: string;
    user_battle_tag?: string;
    desired_role?: string;
  } | null;
  created_at: string;
  user: {
    id: string;
    email: string | null;
    display_name: string | null;
    battle_tag: string | null;
  } | null;
};

export default function ManageTeamPage() {
  const t = useT('manageTeam');
  const { lang } = useLang();
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  const { loading: authLoading, ready } = usePlayerSession();
  const { adminFetchJson } = useAdminFetch();
  const {
    data: managedTeam,
    loading: teamLoading,
    reload: reloadTeam,
  } = useManagedTeam();
  const [requestsLoading, setRequestsLoading] = useState(true);

  // Team / roster / role flags are sourced from the shared useManagedTeam
  // cache. We mirror them into local state so the existing optimistic updates
  // (remove member, role change) keep working without an extra round-trip.
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [isCaptain, setIsCaptain] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<string | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loading = authLoading || teamLoading || requestsLoading;

  // Sync local mirror whenever the shared team payload changes.
  useEffect(() => {
    if (!managedTeam) return;
    setTeam((managedTeam.team as TeamInfo) || null);
    setMembers((managedTeam.members as Member[]) || []);
    setIsCaptain(managedTeam.isCaptain);
    setIsManager(managedTeam.isManager);
  }, [managedTeam]);

  const loadJoinRequests = useCallback(async () => {
    const requestsData = await adminFetchJson<{ demandes?: JoinRequest[] }>(
      '/api/teams/join-requests'
    ).catch(() => null);
    if (requestsData) {
      setJoinRequests(requestsData.demandes || []);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setRequestsLoading(true);
    loadJoinRequests()
      .catch(() => {
        if (!cancelled) setError(t.loadError);
      })
      .finally(() => {
        if (!cancelled) setRequestsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, loadJoinRequests, t]);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSuccessMsg(null), 3000);
  };

  useEffect(() => {
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, []);

  const handleToggleJoinable = async () => {
    setActionLoading('joinable');
    setError(null);
    try {
      const data = await adminFetchJson<{ is_joinable: boolean }>(
        '/api/teams/toggle-joinable',
        {
          method: 'POST',
          body: JSON.stringify({ joinable: !team?.is_joinable }),
        }
      );
      setTeam((prev) =>
        prev ? { ...prev, is_joinable: data.is_joinable } : prev
      );
      void reloadTeam();
      showSuccess(data.is_joinable ? t.recruitmentOpen : t.recruitmentClosed);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!team) return;
    setActionLoading(`remove-${memberId}`);
    setError(null);
    try {
      await adminFetchJson(`/api/teams/${team.id}/members`, {
        method: 'DELETE',
        body: JSON.stringify({ memberId }),
      });
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      setPendingRemoval(null);
      // Keep the shared cache in sync for other player pages (silent).
      void reloadTeam();
      showSuccess(t.memberRemoved);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateRole = async (memberId: string, role: string) => {
    setActionLoading(`role-${memberId}`);
    setError(null);
    try {
      const data = await adminFetchJson<{
        newRole: string | null;
        isSubstitute: boolean;
      }>('/api/teams/update-member-role', {
        method: 'PATCH',
        body: JSON.stringify({ memberId, role }),
      });
      setMembers((prev) =>
        prev.map((m) =>
          m.id === memberId
            ? { ...m, role: data.newRole, is_substitute: data.isSubstitute }
            : m
        )
      );
      void reloadTeam();
      showSuccess(t.roleUpdated);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePromoteCaptain = async (member: Member) => {
    if (!member.user_id) return;
    setActionLoading(`promote-${member.id}`);
    setError(null);
    try {
      await adminFetchJson('/api/teams/transfer-captain', {
        method: 'PATCH',
        body: JSON.stringify({ newCaptainUserId: member.user_id }),
      });
      setPendingPromotion(null);
      await reloadTeam();
      showSuccess(
        format(t.promoteSuccess, { name: member.battle_tag || t.unknown })
      );
    } catch (err: unknown) {
      setError((err as Error).message || t.promoteError);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateSpecialty = async (
    memberId: string,
    value: string
  ) => {
    const specialty: Specialty = value
      ? (value as Exclude<Specialty, null>)
      : null;
    setActionLoading(`specialty-${memberId}`);
    setError(null);
    try {
      await adminFetchJson('/api/teams/update-member-specialty', {
        method: 'PATCH',
        body: JSON.stringify({ memberId, specialty }),
      });
      await reloadTeam();
    } catch (err: unknown) {
      setError((err as Error).message || t.specialtyError);
    } finally {
      setActionLoading(null);
    }
  };

  const handleJoinAction = async (
    demandeId: string,
    action: 'approve' | 'reject'
  ) => {
    setActionLoading(`join-${demandeId}`);
    setError(null);
    try {
      await adminFetchJson('/api/teams/join-requests', {
        method: 'POST',
        body: JSON.stringify({ demandeId, action }),
      });
      setJoinRequests((prev) => prev.filter((r) => r.id !== demandeId));
      if (action === 'approve') {
        await reloadTeam();
      }
      showSuccess(action === 'approve' ? t.playerAccepted : t.requestRejected);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  if (authLoading || loading) {
    return <PlayerPageSkeleton rows={4} />;
  }

  if (!team || (!isCaptain && !isManager)) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-xl font-bold mb-4">{t.accessDeniedTitle}</h1>
          <p className="text-gray-400 mb-6">{t.accessDeniedBody}</p>
          <Link
            href="/player"
            className="inline-block px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 font-semibold transition"
          >
            {t.backToSpace}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{format(t.tabTitle, { name: team.name })}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="max-w-3xl mx-auto px-4 py-10 pt-24">
          <Link
            href="/player"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6"
          >
            &larr; {t.backToSpace}
          </Link>

          {/* Team header */}
          <div className="flex items-center gap-4 mb-8">
            {team.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={team.logo_url}
                alt={team.name}
                className="w-16 h-16 rounded-full object-cover border border-white/10"
              />
            )}
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{team.name}</h1>
              {team.short_name && (
                <div className="text-sm text-gray-400">{team.short_name}</div>
              )}
            </div>
            <Link
              href={`/team/${encodeURIComponent(team.slug || team.id)}`}
              className="text-sm text-purple-300 hover:text-purple-200"
            >
              {t.publicPage}
            </Link>
          </div>

          {successMsg && (
            <div className="mb-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {successMsg}
            </div>
          )}

          {error && (
            <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          {/* Recrutement toggle */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{t.recruitment}</h2>
                <p className="text-sm text-gray-400 mt-1">
                  {team.is_joinable
                    ? t.recruitmentOpenDesc
                    : t.recruitmentClosedDesc}
                </p>
              </div>
              <button
                onClick={handleToggleJoinable}
                disabled={actionLoading === 'joinable'}
                className={`relative w-12 h-7 rounded-full transition-colors ${
                  team.is_joinable ? 'bg-emerald-500' : 'bg-gray-600'
                } ${actionLoading === 'joinable' ? 'opacity-50' : ''}`}
              >
                <span
                  className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                    team.is_joinable ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Roster */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">
              {format(
                members.length > 1 ? t.roster_other : t.roster_one,
                { count: members.length }
              )}
            </h2>
            {members.filter((m) => !m.is_captain).length === 0 ? (
              <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-5 text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-purple-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                    />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-purple-100 mb-1">
                  {t.onboardingTitle}
                </p>
                <p className="text-xs text-purple-200/80 mb-4">
                  {t.onboardingBody}
                </p>
                <Link
                  href={`/team/${encodeURIComponent(team.slug || team.id)}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-sm font-semibold transition"
                >
                  {t.onboardingCta}
                </Link>
              </div>
            ) : null}
            <div className="space-y-3">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-black/60 border border-white/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs text-gray-500">
                        {(m.battle_tag || '??').slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-sm truncate">
                          {m.battle_tag || t.unknown}
                        </span>
                        {m.battle_tag && (
                          <CopyButton
                            value={m.battle_tag}
                            label={t.copyBattleTag}
                            className="h-5 w-5 shrink-0"
                          />
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {m.is_captain ? (
                          <span className="text-purple-300">{t.captain}</span>
                        ) : (
                          m.role || 'player'
                        )}
                      </div>
                    </div>
                  </div>

                  {!m.is_captain && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {pendingRemoval === m.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-200 max-w-[10rem] sm:max-w-none">
                            {format(t.removeConfirm, {
                              name: m.battle_tag || t.unknown,
                            })}
                            <span className="block text-[11px] text-red-300/80 mt-0.5">
                              {t.removeConsequences}
                            </span>
                          </span>
                          <button
                            onClick={() => handleRemoveMember(m.id)}
                            disabled={actionLoading === `remove-${m.id}`}
                            className="px-2 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold transition disabled:opacity-50"
                          >
                            {t.confirmRemove}
                          </button>
                          <button
                            onClick={() => setPendingRemoval(null)}
                            disabled={actionLoading === `remove-${m.id}`}
                            className="px-2 py-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs transition disabled:opacity-50"
                          >
                            {t.cancelRemove}
                          </button>
                        </div>
                      ) : pendingPromotion === m.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-purple-200 max-w-[10rem] sm:max-w-none">
                            {format(t.promoteConfirm, {
                              name: m.battle_tag || t.unknown,
                            })}
                          </span>
                          <button
                            onClick={() => handlePromoteCaptain(m)}
                            disabled={actionLoading === `promote-${m.id}`}
                            className="px-2 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs font-semibold transition disabled:opacity-50"
                          >
                            {t.promoteConfirmYes}
                          </button>
                          <button
                            onClick={() => setPendingPromotion(null)}
                            disabled={actionLoading === `promote-${m.id}`}
                            className="px-2 py-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs transition disabled:opacity-50"
                          >
                            {t.promoteCancel}
                          </button>
                        </div>
                      ) : (
                        <>
                          <select
                            value={m.specialty || ''}
                            onChange={(e) =>
                              handleUpdateSpecialty(m.id, e.target.value)
                            }
                            disabled={!!actionLoading}
                            aria-label={t.specialtyLabel}
                            title={t.specialtyLabel}
                            className="bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-400"
                          >
                            <option value="">{t.specialtyNone}</option>
                            <option value="tank">{t.specialtyTank}</option>
                            <option value="dps">{t.specialtyDps}</option>
                            <option value="support">
                              {t.specialtySupport}
                            </option>
                            <option value="flex">{t.specialtyFlex}</option>
                          </select>
                          <select
                            value={m.role || 'player'}
                            onChange={(e) =>
                              handleUpdateRole(m.id, e.target.value)
                            }
                            disabled={!!actionLoading}
                            className="bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-400"
                          >
                            <option value="player">{t.optionPlayer}</option>
                            <option value="substitute">
                              {t.optionSubstitute}
                            </option>
                            <option value="coach">{t.optionCoach}</option>
                          </select>
                          <button
                            onClick={() => setPendingPromotion(m.id)}
                            disabled={!!actionLoading || !m.user_id}
                            className="px-2 py-1 rounded-lg border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-xs font-semibold transition disabled:opacity-50"
                            title={t.promote}
                            aria-label={t.promote}
                          >
                            {t.promote}
                          </button>
                          <button
                            onClick={() => setPendingRemoval(m.id)}
                            disabled={!!actionLoading}
                            className="p-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 transition disabled:opacity-50"
                            title={t.removeTitle}
                            aria-label={t.removeTitle}
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Demandes en attente */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
            <h2 className="text-lg font-semibold mb-4">
              {t.pendingRequests}
              {joinRequests.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold">
                  {joinRequests.length}
                </span>
              )}
            </h2>

            {joinRequests.length === 0 ? (
              <p className="text-sm text-gray-500">{t.noPendingRequests}</p>
            ) : (
              <div className="space-y-3">
                {joinRequests.map((req) => {
                  const name =
                    req.user?.display_name ||
                    req.payload?.user_display_name ||
                    req.user?.email?.split('@')[0] ||
                    t.defaultPlayerName;
                  const btag =
                    req.user?.battle_tag || req.payload?.user_battle_tag;
                  const role = req.payload?.desired_role || 'player';

                  return (
                    <div
                      key={req.id}
                      className="p-4 rounded-xl bg-white/5 border border-white/5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-sm">
                            {name}
                            {btag && (
                              <span className="text-gray-400 font-mono ml-2 text-xs">
                                {btag}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {t.wantsToJoinAs}
                            <span className="text-gray-300">{role}</span>
                            {' · '}
                            {new Date(req.created_at).toLocaleDateString(
                              locale
                            )}
                          </div>
                          {req.comment && (
                            <div className="mt-2 text-xs text-gray-400 italic bg-white/5 rounded-lg px-3 py-2">
                              &ldquo;{req.comment}&rdquo;
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => handleJoinAction(req.id, 'approve')}
                            disabled={actionLoading === `join-${req.id}`}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold transition disabled:opacity-50"
                          >
                            {t.accept}
                          </button>
                          <button
                            onClick={() => handleJoinAction(req.id, 'reject')}
                            disabled={actionLoading === `join-${req.id}`}
                            className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-semibold transition disabled:opacity-50"
                          >
                            {t.reject}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
