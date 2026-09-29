import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { withAdminQuery } from '@/features/admin/_shared/query';
import {
  useTeam,
  useTeamMembers,
} from '@/features/admin/teams/hooks/useTeamsQueries';
import Breadcrumb from '@/components/admin/Breadcrumb';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { isNonPlayingTeamRole, splitTeamMembers } from '@/utils/teams/roleKind';
import nsAdminTeamDetail from '@/lib/i18n/locales/admin-fr/adminTeamDetail';
import TeamAvailabilityPanel from '@/components/admin/teams/TeamAvailabilityPanel';
import TeamExportActions from '@/components/admin/teams/TeamExportActions';
import EntityHeader from '@/features/admin/_shared/ui/EntityHeader';
import {
  FicheLayout,
  FicheSection,
  MetaList,
} from '@/features/admin/_shared/ui/Fiche';
import { AdminButtonLink } from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};

type TeamMemberRow = {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  /** Pseudo — l'encadrement n'a pas forcément de BattleTag. */
  display_name?: string | null;
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

export const getServerSideProps = withStaffPage({ permission: 'manage_teams' });

const EMPTY_MEMBERS: TeamMemberRow[] = [];

function AdminTeamDetailPage(_props: StaffProps) {
  const t = useAdminT(nsAdminTeamDetail);
  const router = useRouter();
  const { teamId } = router.query as { teamId?: string };
  // Mêmes clés que l'édition (lot L10) : revenir de l'édition montre la
  // fiche à jour, relue en arrière-plan.
  const teamQuery = useTeam(teamId);
  const membersQuery = useTeamMembers(teamId);
  const team = teamQuery.data?.team ?? null;
  const members = membersQuery.data ?? EMPTY_MEMBERS;
  const loading = teamQuery.isPending && !!teamId;
  const membersLoading = membersQuery.isPending && !!teamId;
  const errorMsg = teamQuery.error
    ? teamQuery.error.message || t.errUnexpected
    : null;
  const membersError = membersQuery.error
    ? membersQuery.error.message || t.errUnexpected
    : null;

  // Joueuses d'abord, encadrement ensuite — cohérent avec /edit.
  const orderedMembers = (() => {
    const { roster, subs, staff } = splitTeamMembers(members);
    return [...roster, ...subs, ...staff];
  })();

  const backUrl = '/admin/teams';

  return (
    <>
      <Head>
        <title>{t.headTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <Breadcrumb
          items={[
            { label: t.breadcrumbTeams, href: '/admin/teams' },
            { label: team?.name || t.breadcrumbTeam },
          ]}
        />
        <button
          type="button"
          onClick={() => router.push(backUrl)}
          className="mb-3 inline-flex items-center gap-2 text-sm text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]"
        >
          {t.backToList}
        </button>

        <EntityHeader
          crest={
            team?.logo_url ? (
              // biome-ignore lint/performance/noImgElement: image hors next/image (exclusion reprise d’ESLint)
              <img
                src={team.logo_url}
                alt={team.name}
                className="h-full w-full object-cover"
              />
            ) : team ? (
              (team.short_name || team.name).slice(0, 3).toUpperCase()
            ) : undefined
          }
          title={team?.name || t.teamFallback}
          meta={
            <>
              {t.overview}
              {team?.short_name
                ? ` · ${format(t.tagLabel, { tag: team.short_name })}`
                : ''}
            </>
          }
          status={
            team ? (
              <Chip tone={team.is_active ? 'ok' : 'err'}>
                {team.is_active ? t.active : t.inactive}
              </Chip>
            ) : undefined
          }
          actions={
            teamId ? (
              <>
                <TeamExportActions teamId={teamId} />
                <AdminButtonLink
                  href={`/admin/teams/${teamId}/edit?add-member=1`}
                  size="sm"
                >
                  {t.addMember}
                </AdminButtonLink>
                <AdminButtonLink
                  href={`/admin/teams/${teamId}/edit`}
                  variant="primary"
                  size="sm"
                >
                  {t.edit}
                </AdminButtonLink>
              </>
            ) : undefined
          }
        />

        {errorMsg && (
          <div className="mb-4 rounded-[var(--r-ctrl,4px)] border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {errorMsg}
          </div>
        )}

        <FicheLayout
          main={
            <>
              <FicheSection
                title={
                  <span className="flex items-center gap-2">
                    {t.members}
                    {(() => {
                      const unverified = members.filter(
                        (m) => m.battle_tag && !m.battle_tag_verified_at
                      ).length;
                      if (unverified === 0) return null;
                      return (
                        <Chip>
                          {format(t.unverifiedCount, { count: unverified })}
                        </Chip>
                      );
                    })()}
                  </span>
                }
                aside={
                  <Link
                    href={`/admin/teams/${teamId}/edit?add-member=1`}
                    className="text-sm text-[var(--or-200,#eec4ff)] underline hover:text-[var(--t1,#f4edf7)]"
                  >
                    {t.addMember}
                  </Link>
                }
              >
                {membersLoading ? (
                  <p className="text-sm text-[var(--t3,#a39ba6)]">
                    {t.loadingMembers}
                  </p>
                ) : membersError ? (
                  <p className="text-sm text-red-200">{membersError}</p>
                ) : members.length === 0 ? (
                  <p className="text-sm text-[var(--t3,#a39ba6)]">
                    {t.noMembers}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {/* Encadrement en fin de liste : coach et manager ne sont pas
                        des joueuses (même règle que l'écran d'édition). */}
                    {orderedMembers.map((m) => {
                      const isCaptain = team?.captain_id === m.user_id;
                      const isManager =
                        !isCaptain && isNonPlayingTeamRole(m.role);
                      const containerClass = isCaptain
                        ? 'border-l-[3px] border-[var(--or,#b467d1)]'
                        : 'border border-[var(--line2,rgba(194,196,201,.2))]';
                      const iconClass = isCaptain
                        ? 'text-[var(--or-200,#eec4ff)]'
                        : isManager
                          ? 'text-[var(--t2,#c7bfca)]'
                          : 'text-[var(--t3,#a39ba6)]';
                      return (
                        <div
                          key={m.id}
                          className={`flex items-center justify-between gap-3 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm ${containerClass}`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-8 w-8 items-center justify-center rounded-[var(--r-ctrl,4px)] bg-[var(--s3,#2f2732)] ${iconClass}`}
                            >
                              {isCaptain ? (
                                <svg
                                  className="w-4 h-4"
                                  fill="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
                                </svg>
                              ) : isManager ? (
                                <svg
                                  className="w-4 h-4"
                                  fill="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path d="M12 2l3.5 7.5L23 11l-5.5 5 1.3 7.5L12 19.5 5.2 23.5 6.5 16 1 11l7.5-1.5L12 2z" />
                                </svg>
                              ) : (
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
                                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                  />
                                </svg>
                              )}
                            </div>
                            <div className="flex flex-col">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-[var(--t1,#f4edf7)]">
                                  {(isNonPlayingTeamRole(m.role)
                                    ? m.display_name || m.battle_tag
                                    : m.battle_tag || m.display_name) ||
                                    m.user_id.slice(0, 8) + '...'}
                                </span>
                                {isCaptain && (
                                  <Chip tone="brand">{t.captain}</Chip>
                                )}
                                {isManager && <Chip>{t.manager}</Chip>}
                                {m.battle_tag &&
                                  (m.battle_tag_verified_at ? (
                                    <Chip
                                      tone="ok"
                                      title={format(t.battleTagVerifiedTitle, {
                                        date: formatVerifiedDate(
                                          m.battle_tag_verified_at
                                        ),
                                      })}
                                    >
                                      {t.battleTagVerified}
                                    </Chip>
                                  ) : (
                                    <Chip title={t.battleTagUnverifiedTitle}>
                                      {t.battleTagUnverified}
                                    </Chip>
                                  ))}
                                {m.battle_tag_mismatch && (
                                  <Chip
                                    tone="warn"
                                    title={t.battleTagMismatchTitle}
                                  >
                                    {t.battleTagMismatch}
                                  </Chip>
                                )}
                              </div>
                              <span className="text-xs text-[var(--t3,#a39ba6)]">
                                {m.role || '—'}
                              </span>
                            </div>
                          </div>
                          <span className="font-mono text-xs text-[var(--t4,#807984)]">
                            {new Date(m.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </FicheSection>

              {teamId && <TeamAvailabilityPanel teamId={teamId} />}
            </>
          }
          aside={
            <FicheSection eyebrow title={t.informations}>
              {loading ? (
                <p className="text-sm text-[var(--t3,#a39ba6)]">
                  {t.loadingTeam}
                </p>
              ) : !team ? (
                <p className="text-sm text-[var(--t3,#a39ba6)]">
                  {t.teamNotFound}
                </p>
              ) : (
                <>
                  <MetaList
                    items={[
                      { label: t.countryLabel, value: team.country || '—' },
                      { label: t.websiteLabel, value: team.website || '—' },
                      { label: t.twitterLabel, value: team.twitter || '—' },
                      { label: t.discordLabel, value: team.discord || '—' },
                    ]}
                  />
                  <p className="mt-5 mb-2 font-[family-name:var(--fd)] text-[12px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
                    {t.description}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-[var(--t2,#c7bfca)]">
                    {team.description || '—'}
                  </p>
                </>
              )}
            </FicheSection>
          }
        />
      </div>
    </>
  );
}

export default withAdminQuery(AdminTeamDetailPage);
