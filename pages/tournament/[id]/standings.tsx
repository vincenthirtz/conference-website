// pages/tournament/[id]/standings.tsx
// Onglet « Classement » : le classement officiel des phases à points (round
// robin, poules, suisse), tel que l'admin le calcule — confrontation directe et
// départages du staff compris. Les tournois à élimination directe n'ont rien à
// classer ici : la page le dit et renvoie au bracket.

import { GetStaticPaths, GetStaticProps } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { findTournamentByIdOrSlug } from '@/utils/tournamentLookup';
import {
  FORM_LENGTH,
  readPublicStandings,
  type FormResult,
  type PublicStandingRow,
  type PublicStandingsTable,
} from '@/utils/stages/publicStandings';
import type { TiebreakerKey } from '@/utils/stages/tiebreakers';
import { useT, format } from '@/lib/i18n/useT';
import TournamentTabs from '@/components/tournament/TournamentTabs';
import nsTournamentStandings from '@/lib/i18n/locales/fr/tournamentStandings';

type StandingsDict = typeof nsTournamentStandings.fr;

type Tournament = {
  id: string;
  slug: string | null;
  name: string;
  status: string;
  visibility: string | null;
};

type Props = {
  tournament: Tournament;
  tables: PublicStandingsTable[];
  hasFfaStage: boolean;
  seo: SeoProps;
};

function buildStandingsSeo(tournament: Tournament): SeoProps {
  const name = tournament.name;
  return {
    title: { fr: `Classement – ${name}`, en: `Standings – ${name}` },
    description: {
      fr: `Classement officiel du tournoi ${name} — OW Women's Cup : points, victoires, défaites, différence de maps et forme de chaque équipe.`,
      en: `Official standings of the ${name} tournament — OW Women's Cup: points, wins, losses, map differential and form of every team.`,
    },
    type: 'website',
  };
}

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps<Props> = async (ctx) => {
  const id = ctx.params?.id;
  if (!id || Array.isArray(id)) {
    return { notFound: true, revalidate: 60 };
  }

  // S5d: getStaticProps → DEFAULT_TENANT_ID (TODO(S7) — SSR/ISR per tenant).
  const tenantId = DEFAULT_TENANT_ID;

  const tournament = await findTournamentByIdOrSlug<Tournament>(
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

  const [tables, stagesRes] = await Promise.all([
    readPublicStandings(tenantId, tournament.id),
    supabaseAdmin
      .from('tournament_stages')
      .select('stage_type')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournament.id),
  ]);
  const stageTypes = (stagesRes.data || []).map(
    (s: { stage_type: string }) => s.stage_type
  );

  return {
    props: {
      tournament,
      tables,
      hasFfaStage: stageTypes.includes('ffa'),
      seo: buildStandingsSeo(tournament),
    },
    revalidate: 60,
  };
};

export default function TournamentStandingsPage({
  tournament,
  tables,
  hasFfaStage,
}: Props) {
  const t = useT(nsTournamentStandings);
  const tournamentPath = `/tournament/${tournament.slug || tournament.id}`;
  const isCompleted =
    tournament.status === 'finished' || tournament.status === 'completed';
  const hasResults = tables.some((tb) => tb.rows.some((r) => r.played > 0));
  const showStageTitles = tables.length > 1;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="container mx-auto px-4 pt-24 pb-16 max-w-6xl">
        <section className="mb-6">
          <Heading typeStyle="heading-md" className="text-brand-gradient mb-1">
            {format(t.heading, { name: tournament.name })}
          </Heading>
          <span className="brand-rule mb-2" aria-hidden />
          <Paragraph
            typeStyle="body-sm"
            textColor="text-gray-200"
            className="max-w-xl"
          >
            {t.description}
          </Paragraph>
        </section>

        <TournamentTabs
          tournamentPath={tournamentPath}
          active="standings"
          showPodium={isCompleted}
          showFfa={hasFfaStage}
        />

        {tables.length === 0 ? (
          <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
            <Paragraph typeStyle="body-sm" textColor="text-gray-300">
              {t.empty}
            </Paragraph>
          </div>
        ) : (
          <>
            {!hasResults && (
              <p className="mb-4 text-sm text-gray-300">{t.emptyNoResult}</p>
            )}
            {tables.map((table) => (
              <StandingsTable
                key={table.key}
                table={table}
                title={
                  table.groupKey
                    ? `${showStageTitles ? `${table.stageName} · ` : ''}${format(
                        t.groupLabel,
                        { key: table.groupKey }
                      )}`
                    : showStageTitles
                      ? table.stageName
                      : null
                }
                t={t}
              />
            ))}
            <p className="mt-2 text-[11px] text-gray-500">{t.legend}</p>
            <p className="mt-4">
              <Link
                href={`${tournamentPath}/matches`}
                className="text-sm text-[var(--color-violet-light)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet)] rounded"
              >
                {t.seeMatches}
              </Link>
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function StandingsTable({
  table,
  title,
  t,
}: {
  table: PublicStandingsTable;
  title: string | null;
  t: StandingsDict;
}) {
  const showDraws = table.rows.some((r) => r.draws > 0);
  const th = 'py-2 px-2 text-right font-medium';

  return (
    <section className="mb-6 bg-black/60 border border-white/5 rounded-2xl p-4">
      {title && (
        <h2 className="text-[11px] uppercase tracking-wide text-gray-400 mb-3">
          {title}
        </h2>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-[11px] text-gray-400 border-b border-white/10">
              <th scope="col" className="py-2 pr-2 text-left font-medium">
                {t.colRank}
              </th>
              <th scope="col" className="py-2 pr-2 text-left font-medium">
                {t.colTeam}
              </th>
              <th scope="col" className={th}>
                <abbr title={t.colPlayedTitle}>{t.colPlayed}</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title={t.colWinsTitle}>{t.colWins}</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title={t.colLossesTitle}>{t.colLosses}</abbr>
              </th>
              {showDraws && (
                <th scope="col" className={th}>
                  <abbr title={t.colDrawsTitle}>{t.colDraws}</abbr>
                </th>
              )}
              <th scope="col" className={`${th} hidden sm:table-cell`}>
                <abbr title={t.colMapsTitle}>{t.colMaps}</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title={t.colDiffTitle}>{t.colDiff}</abbr>
              </th>
              <th scope="col" className={`${th} hidden md:table-cell`}>
                <abbr title={format(t.colFormTitle, { count: FORM_LENGTH })}>
                  {t.colForm}
                </abbr>
              </th>
              <th scope="col" className={`${th} text-white`}>
                <abbr title={t.colPointsTitle}>{t.colPoints}</abbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <StandingRow
                key={row.teamId}
                row={row}
                showDraws={showDraws}
                t={t}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StandingRow({
  row,
  showDraws,
  t,
}: {
  row: PublicStandingRow;
  showDraws: boolean;
  t: StandingsDict;
}) {
  const diff = row.mapsWon - row.mapsLost;
  const td = 'py-2 px-2 text-right tabular-nums text-gray-100';
  const label = row.shortName || row.teamName;
  const name = (
    <span className="flex items-center gap-2 min-w-0">
      <span className="w-7 h-7 flex-shrink-0 rounded-full bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden">
        {row.logoUrl ? (
          <Image
            src={row.logoUrl}
            alt=""
            width={28}
            height={28}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-[9px] text-gray-400">
            {label.slice(0, 2).toUpperCase()}
          </span>
        )}
      </span>
      <span className="truncate">{row.teamName}</span>
    </span>
  );

  return (
    <tr className="border-b border-white/5 last:border-b-0">
      <td className="py-2 pr-2 tabular-nums text-gray-400">
        {row.rank}
        {/* Avant tout match, tout le monde est à égalité : l'astérisque
            ne dirait rien. */}
        {row.tiebrokenBy && row.played > 0 && (
          <abbr
            title={format(t.tiebrokenBy, {
              criterion: tiebreakLabel(row.tiebrokenBy, t),
            })}
            className="ml-0.5 text-[var(--color-violet-light)] no-underline cursor-help"
          >
            *
          </abbr>
        )}
      </td>
      <td className="py-2 pr-2 text-left text-white max-w-[14rem]">
        {row.slug ? (
          <Link
            href={`/team/${row.slug}`}
            className="hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet)] rounded"
          >
            {name}
          </Link>
        ) : (
          name
        )}
      </td>
      <td className={td}>{row.played}</td>
      <td className={td}>{row.wins}</td>
      <td className={td}>{row.losses}</td>
      {showDraws && <td className={td}>{row.draws}</td>}
      <td className={`${td} hidden sm:table-cell`}>
        {row.mapsWon}–{row.mapsLost}
      </td>
      <td
        className={`${td} ${
          diff > 0
            ? 'text-emerald-300'
            : diff < 0
              ? 'text-red-300'
              : 'text-gray-300'
        }`}
      >
        {diff > 0 ? `+${diff}` : diff}
      </td>
      <td className={`${td} hidden md:table-cell`}>
        <span className="inline-flex gap-1 justify-end">
          {row.form.map((r, i) => (
            <FormPill key={i} result={r} t={t} />
          ))}
        </span>
      </td>
      <td className={`${td} font-semibold text-white`}>{row.points}</td>
    </tr>
  );
}

function FormPill({ result, t }: { result: FormResult; t: StandingsDict }) {
  const style =
    result === 'W'
      ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/50'
      : result === 'L'
        ? 'bg-red-500/15 text-red-200 border-red-500/40'
        : 'bg-white/10 text-gray-200 border-white/20';
  const [full, short] =
    result === 'W'
      ? [t.formW, t.formWShort]
      : result === 'L'
        ? [t.formL, t.formLShort]
        : [t.formD, t.formDShort];
  return (
    <abbr
      title={full}
      className={`w-5 h-5 inline-flex items-center justify-center rounded border text-[10px] font-semibold no-underline ${style}`}
    >
      {short}
    </abbr>
  );
}

function tiebreakLabel(key: TiebreakerKey, t: StandingsDict): string {
  switch (key) {
    case 'head_to_head':
      return t.tbHeadToHead;
    case 'score_diff':
      return t.tbScoreDiff;
    case 'wins':
      return t.tbWins;
    case 'scored':
      return t.tbScored;
    case 'seed':
      return t.tbSeed;
  }
}
