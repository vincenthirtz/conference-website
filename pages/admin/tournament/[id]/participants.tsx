// pages/admin/tournament/[id]/participants.tsx
//
// APERÇU des inscrites d'un tournoi regroupé en équipes de 5 (Phases ›
// Inscrites) : d'un coup d'œil, qui joue dans quelle équipe, qui attend avec
// son équipe d'origine, qui s'est inscrite seule.
//
// Lecture seule. Même requête que l'écran de répartition (même cache) ; les
// gestes restent là-bas, un lien y mène. La mise en forme vit dans
// features/admin/tournaments/poolOverview.ts.

import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminT } from '@/lib/i18n/useAdminT';
import { format as fmt } from '@/lib/i18n/useT';
import { AdminHttpError } from '@/utils/admin/adminHttp';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { useTournamentPool } from '@/features/admin/tournaments/hooks/useTournamentPool';
import { buildPoolOverview } from '@/features/admin/tournaments/poolOverview';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import type { StaffProps } from '@/types/admin';
import type { AdminPoolEntry } from '@/features/admin/tournaments/model';
import nsAdminTournamentPool from '@/lib/i18n/locales/admin-fr/adminTournamentPool';

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

const card =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4';
const inner =
  'rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)]';
const sectionTitle =
  'font-[family-name:var(--fd)] text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--t1,#f4edf7)] [font-stretch:75%]';
const muted = 'text-[var(--t4,#807984)]';

export default withAdminQuery(AdminTournamentParticipantsPage);

function AdminTournamentParticipantsPage(_: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : (id ?? '');
  const t = useAdminT(nsAdminTournamentPool);
  const poolQuery = useTournamentPool(tournamentId);

  if (poolQuery.isPending) {
    return (
      <Shell id={tournamentId} title={t.overviewHeadTitle}>
        <p className="text-[var(--t3,#a39ba6)]">{t.loading}</p>
      </Shell>
    );
  }
  if (
    poolQuery.error instanceof AdminHttpError &&
    poolQuery.error.status === 409
  ) {
    return (
      <Shell id={tournamentId} title={t.overviewHeadTitle}>
        <p className="text-[#ffd9a3]">{t.notPooled}</p>
      </Shell>
    );
  }
  if (poolQuery.error || !poolQuery.data) {
    return (
      <Shell id={tournamentId} title={t.overviewHeadTitle}>
        <p className="text-[var(--err,#ff6b6b)]" role="alert">
          {t.loadError}
        </p>
      </Shell>
    );
  }

  const o = buildPoolOverview(poolQuery.data);
  const size = String(o.teamSize);
  const stats = [
    [t.overviewStatTeams, o.counts.teams],
    [t.overviewStatPlayers, o.counts.playersInTeams],
    [t.overviewStatWaiting, o.counts.waiting],
    [t.overviewStatSolos, o.counts.solos],
  ] as const;

  return (
    <Shell id={tournamentId} title={t.overviewHeadTitle}>
      <AdminPageHeader
        title={t.overviewTitle}
        subtitle={<span className="block max-w-3xl">{t.overviewSubtitle}</span>}
        actions={
          <>
            <AdminButtonLink
              size="sm"
              href={`/admin/tournament/${tournamentId}/pool`}
            >
              {t.overviewToPool}
            </AdminButtonLink>
            <AdminButton
              size="sm"
              onClick={() => void poolQuery.refetch()}
              disabled={poolQuery.isFetching}
            >
              {t.refresh}
            </AdminButton>
          </>
        }
      />

      <dl
        className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4"
        data-testid="participants-stats"
      >
        {stats.map(([label, value]) => (
          <div key={label} className={card}>
            <dt className={`text-xs uppercase tracking-[0.12em] ${muted}`}>
              {label}
            </dt>
            <dd
              className="mt-1 text-2xl font-bold text-[var(--t1,#f4edf7)]"
              data-numeric
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="space-y-6">
        {/* Équipes inscrites, avec leurs joueuses */}
        <section className={card} data-testid="participants-teams">
          <h2 className={sectionTitle}>
            {t.overviewTeamsTitle} ({o.counts.teams})
          </h2>
          {o.teams.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--t3,#a39ba6)]">
              {t.squadsEmpty}
            </p>
          ) : (
            <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {o.teams.map((team) => (
                <li key={team.teamId} className={`${inner} p-3`}>
                  <p className="flex flex-wrap items-center gap-2 font-medium text-[var(--t1,#f4edf7)]">
                    {team.teamName}
                    <Chip tone={team.starters >= o.teamSize ? 'ok' : 'warn'}>
                      {fmt(t.overviewTeamCount, {
                        count: String(team.starters),
                        size,
                      })}
                    </Chip>
                    {team.mixed && <Chip tone="brand">{t.squadMixed}</Chip>}
                    {team.source === 'roster' && (
                      <span title={t.overviewFromRosterHelp}>
                        <Chip>{t.overviewFromRoster}</Chip>
                      </span>
                    )}
                  </p>
                  {team.players.length === 0 ? (
                    <p className={`mt-1 text-xs ${muted}`}>
                      {t.overviewNoPlayers}
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {team.players.map((p) => (
                        <li
                          key={p.id}
                          className="text-sm text-[var(--t2,#c7bfca)]"
                        >
                          {p.name}{' '}
                          <span className={muted}>
                            {p.fromTeam
                              ? fmt(t.fromTeam, { team: p.fromTeam })
                              : p.battleTag && p.battleTag !== p.name
                                ? p.battleTag
                                : ''}
                          </span>
                          {p.substitute && (
                            <span className={`ml-2 text-xs ${muted}`}>
                              · {t.overviewSubstitute}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Liste d'attente, rangée par équipe d'origine */}
        <section className={card} data-testid="participants-waiting">
          <h2 className={sectionTitle}>
            {t.overviewWaitingTitle} ({o.counts.waiting - o.counts.solos})
          </h2>
          {o.waitingByTeam.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--t3,#a39ba6)]">
              {t.overviewWaitingEmpty}
            </p>
          ) : (
            <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {o.waitingByTeam.map((g) => (
                <li key={g.teamId} className={`${inner} p-3`}>
                  <p className="flex flex-wrap items-center gap-2 font-medium text-[var(--t1,#f4edf7)]">
                    {g.teamName}
                    <Chip tone="warn">
                      {fmt(t.overviewWaitingCount, {
                        count: String(g.entries.length),
                        size,
                      })}
                    </Chip>
                  </p>
                  <EntryList entries={g.entries} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Inscrites seules, sans équipe */}
        <section className={card} data-testid="participants-solos">
          <h2 className={sectionTitle}>
            {t.overviewSolosTitle} ({o.counts.solos})
          </h2>
          {o.solos.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--t3,#a39ba6)]">
              {t.overviewSolosEmpty}
            </p>
          ) : (
            <div className={`${inner} mt-3 p-3`}>
              <EntryList entries={o.solos} withDate />
            </div>
          )}
        </section>
      </div>
    </Shell>
  );
}

function EntryList({
  entries,
  withDate = false,
}: {
  entries: AdminPoolEntry[];
  withDate?: boolean;
}) {
  const t = useAdminT(nsAdminTournamentPool);
  return (
    <ul className="mt-2 space-y-1">
      {entries.map((e) => (
        <li key={e.id} className="text-sm text-[var(--t2,#c7bfca)]">
          {e.displayName} <span className={muted}>{e.battleTag}</span>
          {withDate && (
            <span className={`ml-2 text-xs ${muted}`}>
              ·{' '}
              {fmt(t.overviewSignedUpOn, {
                date: new Date(e.createdAt).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                }),
              })}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Shell({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <div>
          <TournamentTabsNav tournamentId={id} active="stages" />
          {children}
        </div>
      </div>
    </>
  );
}
