// pages/tournament/[id]/teams/index.tsx
// Page publique : liste des equipes inscrites a un tournoi. Chaque carte mene
// vers la fiche d'equipe du tournoi (teams/[teamId]). Complete les onglets
// bracket / matches / maps / podium de la page tournoi.

import { GetStaticPaths, GetStaticProps } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import Button from '@/components/Buttons/button';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { findTournamentByIdOrSlug } from '@/utils/tournamentLookup';
import { logger } from '@/utils/logger';
import { useT, format } from '@/lib/i18n/useT';
import TournamentTabs from '@/components/tournament/TournamentTabs';
import nsTournamentTeams from '@/lib/i18n/locales/fr/tournamentTeams';

type Tournament = {
  id: string;
  slug: string | null;
  name: string;
  game: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  visibility?: string | null;
};

type Team = {
  id: string;
  slug: string | null;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

type Props = {
  tournament: Tournament;
  teams: Team[];
  hasFfaStage: boolean;
  seo: SeoProps;
};

function buildTeamsListSeo(
  tournament: Tournament,
  teamCount: number
): SeoProps {
  const name = tournament.name;
  return {
    title: { fr: `Équipes – ${name}`, en: `Teams – ${name}` },
    description: {
      fr: `Les ${teamCount} équipes inscrites au tournoi ${name} — OW Women's Cup : rosters, logos et fiches des équipes de la coupe féminine Overwatch.`,
      en: `The ${teamCount} teams registered for the ${name} tournament — OW Women's Cup: rosters, logos and team pages of the women's Overwatch cup.`,
    },
    type: 'website',
  };
}

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps<Props> = async (ctx) => {
  const id = ctx.params?.id;
  if (!id || Array.isArray(id)) return { notFound: true, revalidate: 60 };
  if (!supabaseAdmin) return { notFound: true, revalidate: 60 };

  // S5d: getStaticProps → DEFAULT_TENANT_ID (TODO(S7) — SSR/ISR per tenant).
  const tenantId = DEFAULT_TENANT_ID;

  // Tournoi (UUID ou slug). Même garde de visibilité que la fiche d'équipe.
  const tournament = await findTournamentByIdOrSlug<Tournament>(
    id,
    'id, name, slug, game, status, start_date, end_date, visibility',
    tenantId
  );
  if (
    !tournament ||
    (tournament.visibility != null && tournament.visibility !== 'public')
  )
    return { notFound: true, revalidate: 60 };

  // Équipes inscrites (via tournament_teams) + phases (pour l'onglet FFA).
  const [teamsRes, stagesRes] = await Promise.all([
    supabaseAdmin
      .from('tournament_teams')
      .select('team:teams ( id, slug, name, short_name, logo_url )')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournament.id),
    supabaseAdmin
      .from('tournament_stages')
      .select('stage_type')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournament.id),
  ]);

  if (teamsRes.error)
    logger.error('tournament teams list error:', teamsRes.error);

  const hasFfaStage = (stagesRes.data || []).some(
    (s: any) => s.stage_type === 'ffa'
  );

  // La jointure `team:teams(...)` est typée en tableau par Supabase mais renvoie
  // un objet unique à l'exécution (relation 1-1 via la FK) — même traitement que
  // la page tournoi parente.
  const teamMap = new Map<string, Team>();
  (teamsRes.data || []).forEach((row: any) => {
    if (row.team) teamMap.set(row.team.id, row.team as Team);
  });
  const teams = Array.from(teamMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'fr')
  );

  return {
    props: {
      tournament,
      teams,
      hasFfaStage,
      seo: buildTeamsListSeo(tournament, teams.length),
    },
    revalidate: 60,
  };
};

export default function TournamentTeamsPage({
  tournament,
  teams,
  hasFfaStage,
}: Props) {
  const t = useT(nsTournamentTeams);
  const tournamentPath = `/tournament/${tournament.slug || tournament.id}`;
  const isCompleted =
    tournament.status === 'finished' || tournament.status === 'completed';

  return (
    <main className="bg-neutral-950 text-white min-h-screen pt-24 pb-16">
      <div className="max-w-5xl mx-auto px-4">
        <section className="mb-8">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-green-light)]/90">
            {t.eyebrow}
          </p>
          <Heading
            level="h1"
            typeStyle="heading-md"
            className="text-brand-gradient mb-1"
          >
            {t.heading}
          </Heading>
          <span className="brand-rule mb-2" aria-hidden />
          <p className="text-sm text-gray-300">
            <Link
              href={tournamentPath}
              className="text-[var(--color-green-light)] hover:text-white underline"
            >
              {tournament.name}
            </Link>{' '}
            {format(teams.length > 1 ? t.teamsCount_other : t.teamsCount_one, {
              count: teams.length,
            })}
          </p>
        </section>

        <TournamentTabs
          tournamentPath={tournamentPath}
          active="teams"
          showPodium={isCompleted}
          showFfa={hasFfaStage}
        />

        {teams.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <Paragraph typeStyle="body-md" textColor="text-gray-300">
              {t.empty}
            </Paragraph>
            <Button
              as="link"
              href={tournamentPath}
              className="mt-4 inline-flex px-6 py-2.5 text-xs font-semibold rounded-full bg-white/5 border border-white/20 hover:border-[var(--color-green)]/60 hover:bg-[var(--color-green)]/10 transition-all"
            >
              {t.backToTournament}
            </Button>
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map((team) => (
              <li key={team.id}>
                <Link
                  href={`${tournamentPath}/teams/${team.id}`}
                  className="group card-brand flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:bg-[var(--color-green)]/[0.07]"
                >
                  {team.logo_url ? (
                    <Image
                      src={team.logo_url}
                      alt={team.name}
                      width={56}
                      height={56}
                      className="h-14 w-14 rounded-lg object-cover bg-neutral-900 border border-white/10"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-neutral-900 border border-white/10 text-lg font-bold text-[var(--color-green-light)]">
                      {(team.short_name || team.name).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white group-hover:text-[var(--color-green-light)]">
                      {team.name}
                    </p>
                    {team.short_name && (
                      <p className="truncate text-xs uppercase tracking-wide text-gray-400">
                        {team.short_name}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
