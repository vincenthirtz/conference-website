import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Button from '@/components/Buttons/button';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import Breadcrumb from '@/components/admin/Breadcrumb';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};

type TeamRow = {
  id: string;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
  banner_url?: string | null;
  country?: string | null;
  description?: string | null;
  twitter?: string | null;
  discord?: string | null;
  website?: string | null;
  is_active?: boolean;
  captain_id?: string | null;
};

type TeamMemberRow = {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  battle_tag?: string | null;
  created_at: string;
  battle_tag_verified_at?: string | null;
  battle_tag_mismatch?: boolean;
};

function formatVerifiedDate(d: string | null | undefined): string {
  if (!d) return '';
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

export const getServerSideProps = withStaffPage('admin');

function AdminTeamDetailPage({ staff }: StaffProps) {
  const t = useAdminT('adminTeamDetail');
  const router = useRouter();
  const { teamId } = router.query as { teamId?: string };
  const { adminFetchJson } = useAdminFetch();

  const [team, setTeam] = useState<TeamRow | null>(null);
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);

  const fetchTeam = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const json = await adminFetchJson<{ team: TeamRow | null }>(
        `/api/admin/teams/${teamId}`
      );
      setTeam(json.team);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errUnexpected);
    } finally {
      setLoading(false);
    }
  }, [teamId, adminFetchJson, t]);

  const fetchMembers = useCallback(async () => {
    if (!teamId) return;
    setMembersLoading(true);
    setMembersError(null);
    try {
      const json = await adminFetchJson<{ members?: TeamMemberRow[] }>(
        `/api/admin/teams/${teamId}/members`
      );
      setMembers(json.members || []);
    } catch (err: unknown) {
      setMembersError((err as Error)?.message ?? t.errUnexpected);
    } finally {
      setMembersLoading(false);
    }
  }, [teamId, adminFetchJson, t]);

  useEffect(() => {
    if (!teamId) return;
    fetchTeam();
    fetchMembers();
    // adminFetchJson et t sont désormais stables ; fetchTeam/fetchMembers ne
    // changent qu'avec teamId → un seul chargement par teamId, sans refetch parasite.
  }, [teamId, fetchTeam, fetchMembers]);

  const backUrl = '/admin/teams';

  return (
    <>
      <Head>
        <title>{t.headTitle}</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        <Breadcrumb
          items={[
            { label: t.breadcrumbTeams, href: '/admin/teams' },
            { label: team?.name || t.breadcrumbTeam },
          ]}
        />
        <header className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <div>
            <button
              type="button"
              onClick={() => router.push(backUrl)}
              className="mb-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
            >
              {t.backToList}
            </button>
            <h1 className="text-3xl font-bold">
              {team?.name || t.teamFallback}{' '}
              {team?.short_name ? `(${team.short_name})` : ''}
            </h1>
            <p className="text-sm text-neutral-400 mt-1">{t.overview}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {teamId && (
              <>
                <Link href={`/admin/teams/${teamId}/edit`}>
                  <Button type="button" size="compact" className="px-4">
                    {t.edit}
                  </Button>
                </Link>
                <Link href={`/admin/teams/${teamId}/edit?add-member=1`}>
                  <Button type="button" size="compact" className="px-4">
                    {t.addMember}
                  </Button>
                </Link>
              </>
            )}
          </div>
        </header>

        {errorMsg && (
          <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-4">
            {errorMsg}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr] items-start">
          <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 space-y-4">
            {loading ? (
              <p className="text-neutral-300 text-sm">{t.loadingTeam}</p>
            ) : !team ? (
              <p className="text-neutral-300 text-sm">{t.teamNotFound}</p>
            ) : (
              <>
                <div className="flex items-center gap-4 flex-wrap">
                  {team.logo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={team.logo_url}
                      alt={team.name}
                      className="w-20 h-20 rounded-full border border-white/10 object-cover bg-white/5"
                    />
                  )}
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.12em] text-neutral-400">
                      {t.informations}
                    </p>
                    <p className="text-2xl font-semibold">{team.name}</p>
                    {team.short_name && (
                      <p className="text-sm text-neutral-300">
                        {format(t.tagLabel, { tag: team.short_name })}
                      </p>
                    )}
                    <p className="text-sm text-neutral-400">
                      {t.statusLabel}{' '}
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${
                          team.is_active
                            ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/50'
                            : 'bg-red-500/15 text-red-200 border border-red-400/50'
                        }`}
                      >
                        {team.is_active ? t.active : t.inactive}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoRow label={t.countryLabel} value={team.country || '—'} />
                  <InfoRow label={t.websiteLabel} value={team.website || '—'} />
                  <InfoRow label={t.twitterLabel} value={team.twitter || '—'} />
                  <InfoRow label={t.discordLabel} value={team.discord || '—'} />
                </div>

                <div className="grid gap-2">
                  <p className="text-xs uppercase tracking-[0.12em] text-neutral-400">
                    {t.description}
                  </p>
                  <p className="text-sm text-neutral-200 whitespace-pre-wrap">
                    {team.description || '—'}
                  </p>
                </div>
              </>
            )}
          </section>

          <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{t.members}</h2>
                {(() => {
                  const unverified = members.filter(
                    (m) => m.battle_tag && !m.battle_tag_verified_at
                  ).length;
                  if (unverified === 0) return null;
                  return (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-neutral-700/60 text-neutral-300 border border-neutral-600">
                      {format(t.unverifiedCount, { count: unverified })}
                    </span>
                  );
                })()}
              </div>
              <Link
                href={`/admin/teams/${teamId}/edit?add-member=1`}
                className="text-sm underline"
              >
                {t.addMember}
              </Link>
            </div>
            {membersLoading ? (
              <p className="text-neutral-300 text-sm">{t.loadingMembers}</p>
            ) : membersError ? (
              <p className="text-red-200 text-sm">{membersError}</p>
            ) : members.length === 0 ? (
              <p className="text-neutral-300 text-sm">{t.noMembers}</p>
            ) : (
              <div className="space-y-2">
                {members.map((m) => {
                  const isCaptain = team?.captain_id === m.user_id;
                  const isManager = !isCaptain && m.role === 'manager';
                  const containerClass = isCaptain
                    ? 'bg-amber-900/20 border border-amber-500/30'
                    : isManager
                      ? 'bg-sky-900/20 border border-sky-500/30'
                      : 'bg-neutral-900/60 border border-neutral-700';
                  const iconBgClass = isCaptain
                    ? 'bg-amber-500/20'
                    : isManager
                      ? 'bg-sky-500/20'
                      : 'bg-neutral-700';
                  return (
                    <div
                      key={m.id}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${containerClass}`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBgClass}`}
                        >
                          {isCaptain ? (
                            <svg
                              className="w-4 h-4 text-amber-400"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
                            </svg>
                          ) : isManager ? (
                            <svg
                              className="w-4 h-4 text-sky-400"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M12 2l3.5 7.5L23 11l-5.5 5 1.3 7.5L12 19.5 5.2 23.5 6.5 16 1 11l7.5-1.5L12 2z" />
                            </svg>
                          ) : (
                            <svg
                              className="w-4 h-4 text-neutral-400"
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
                          )}
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">
                              {m.battle_tag || m.user_id.slice(0, 8) + '...'}
                            </span>
                            {isCaptain && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                                {t.captain}
                              </span>
                            )}
                            {isManager && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/30 font-semibold">
                                {t.manager}
                              </span>
                            )}
                            {m.battle_tag &&
                              (m.battle_tag_verified_at ? (
                                <span
                                  title={format(t.battleTagVerifiedTitle, {
                                    date: formatVerifiedDate(
                                      m.battle_tag_verified_at
                                    ),
                                  })}
                                  className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-600/25 text-emerald-200 border border-emerald-400/40 font-medium"
                                >
                                  {t.battleTagVerified}
                                </span>
                              ) : (
                                <span
                                  title={t.battleTagUnverifiedTitle}
                                  className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-700/60 text-neutral-300 border border-neutral-600"
                                >
                                  {t.battleTagUnverified}
                                </span>
                              ))}
                            {m.battle_tag_mismatch && (
                              <span
                                title={t.battleTagMismatchTitle}
                                className="px-1.5 py-0.5 rounded text-[10px] bg-amber-600/20 text-amber-300 border border-amber-500/40 font-medium"
                              >
                                {t.battleTagMismatch}
                              </span>
                            )}
                          </div>
                          <span className="text-neutral-400 text-xs">
                            {m.role || '—'}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-neutral-500">
                        {new Date(m.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

export default AdminTeamDetailPage;

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-neutral-900/60 border border-neutral-700 rounded-lg px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-400">
        {label}
      </p>
      <p className="text-sm text-neutral-100 break-words">{value || '—'}</p>
    </div>
  );
}
