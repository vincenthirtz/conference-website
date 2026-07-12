// pages/tournament/[id]/ffa.tsx
// Page publique : classement d'un stage FFA (Free-For-All / points-race).
// SSR via readPublicFfaStandings (moteur isolé, lecture service-role, champs
// publics non-PII uniquement). 404 si le tournoi est introuvable ou non public.
// Si le tournoi n'a aucun stage FFA, on rend une page « pas de classement FFA »
// plutôt qu'un 404 (le lien peut exister depuis la fiche tournoi).

import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { findTournamentByIdOrSlug } from '@/utils/tournamentLookup';
import {
  readPublicFfaStandings,
  type PublicFfaStandingRow,
} from '@/utils/public/readFfaStandings';
import { useT, format } from '@/lib/i18n/useT';
import { logger } from '@/utils/logger';
import TournamentTabs from '@/components/tournament/TournamentTabs';

type TournamentLite = {
  id: string;
  slug: string | null;
  name: string;
  status: string;
  visibility: string | null;
};

type Props = {
  tournamentName: string;
  tournamentPath: string;
  stageName: string | null;
  standings: PublicFfaStandingRow[];
  isCompleted: boolean;
};

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps<Props> = async (ctx) => {
  const id = ctx.params?.id;
  if (!id || Array.isArray(id)) {
    return { notFound: true, revalidate: 60 };
  }

  const tenantId = DEFAULT_TENANT_ID;

  const tournament = await findTournamentByIdOrSlug<TournamentLite>(
    id,
    'id, slug, name, status, visibility',
    tenantId
  );
  if (!tournament) {
    return { notFound: true, revalidate: 60 };
  }
  if (tournament.visibility && tournament.visibility !== 'public') {
    return { notFound: true, revalidate: 60 };
  }

  let stageName: string | null = null;
  let standings: PublicFfaStandingRow[] = [];
  try {
    const result = await readPublicFfaStandings(tournament.id, tenantId);
    if (result) {
      stageName = result.stageName;
      standings = result.standings;
    }
  } catch (err) {
    logger.error('public ffa standings page error:', err);
  }

  return {
    props: {
      tournamentName: tournament.name,
      tournamentPath: `/tournament/${tournament.slug || tournament.id}`,
      stageName,
      standings,
      isCompleted:
        tournament.status === 'finished' || tournament.status === 'completed',
    },
    revalidate: 60,
  };
};

function formatBest(value: number | null): string {
  return value === null ? '—' : `#${value}`;
}

export default function TournamentFfaPage({
  tournamentName,
  tournamentPath,
  stageName,
  standings,
  isCompleted,
}: Props) {
  const t = useT('ffaStandings');

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <Head>
        <title>{format(t.headTitle, { name: tournamentName })}</title>
        <meta
          name="description"
          content={format(t.metaDescription, { name: tournamentName })}
        />
        <meta
          property="og:title"
          content={format(t.headTitle, { name: tournamentName })}
        />
      </Head>

      <main className="container mx-auto max-w-5xl px-4 pt-24 pb-16">
        <header className="mb-8">
          <p className="text-[10px] uppercase tracking-widest text-[var(--color-green-light)] mb-2">
            {t.eyebrow}
          </p>
          <Heading
            typeStyle="heading-md"
            level="h1"
            className="text-brand-gradient"
          >
            {t.heading}
          </Heading>
          <span className="brand-rule mt-3" aria-hidden />
          <Paragraph
            typeStyle="body-sm"
            textColor="text-gray-300"
            className="mt-1"
          >
            {stageName ? `${tournamentName} · ${stageName}` : tournamentName}
          </Paragraph>
        </header>

        <TournamentTabs
          tournamentPath={tournamentPath}
          active="ffa"
          showPodium={isCompleted}
          showFfa={true}
        />

        {standings.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-12 text-center">
            <Paragraph typeStyle="body-sm" textColor="text-gray-400">
              {t.empty}
            </Paragraph>
          </div>
        ) : (
          <div className="card-brand overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03]">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-gray-400">
                  <th
                    scope="col"
                    className="w-14 px-4 py-3 text-right tabular-nums"
                  >
                    {t.colRank}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    {t.colTeam}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right tabular-nums">
                    {t.colPoints}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right tabular-nums">
                    {t.colLobbies}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right tabular-nums">
                    {t.colBest}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right tabular-nums">
                    {t.colFirsts}
                  </th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row) => (
                  <tr
                    key={row.teamId}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-200">
                      {row.rank}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-3">
                        {row.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.logoUrl}
                            alt=""
                            className="h-6 w-6 shrink-0 rounded-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span className="h-6 w-6 shrink-0 rounded-full bg-white/10" />
                        )}
                        <span className="truncate font-medium text-white">
                          {row.teamShortName || row.teamName || '—'}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-300">
                      {row.totalPoints}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-300">
                      {row.lobbiesPlayed}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-300">
                      {formatBest(row.bestPlacement)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-300">
                      {row.firsts}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
