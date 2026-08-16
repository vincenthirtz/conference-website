// pages/tournament/[id]/bracket.tsx
//
// Vue publique du BRACKET d'un tournoi (arbre d'élimination simple/double).
// Page ISR (getStaticProps + revalidate) alignée sur ses sœurs (matches, stats…) :
// même chemin de données service-role (findTournamentByIdOrSlug + supabaseAdmin),
// en ne projetant QUE des colonnes publiques non-PII. Rendu via BracketTreeView
// (le même arbre que l'admin) en LECTURE SEULE — aucun `onScoreSaved` n'est passé,
// donc aucune affordance d'édition n'apparaît. Le layout (Navbar/Footer) vient de
// `_app.tsx` ; on ajoute l'en-tête + la barre d'onglets partagée.

import { GetStaticPaths, GetStaticProps } from 'next';
import Link from 'next/link';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { findTournamentByIdOrSlug } from '@/utils/tournamentLookup';
import { useT, format } from '@/lib/i18n/useT';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { formatDateRange } from '@/utils/tournamentDates';
import TournamentTabs from '@/components/tournament/TournamentTabs';
import { BracketTreeView } from '@/components/admin/bracket';
import type {
  BracketRound,
  ScheduleMatch,
} from '@/components/admin/bracket/types';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { logger } from '@/utils/logger';
import nsTournamentBracket from '@/lib/i18n/locales/fr/tournamentBracket';

type BracketDict = typeof nsTournamentBracket.fr;

type Tournament = {
  id: string;
  slug?: string | null;
  name: string;
  game?: string | null;
  status: string;
  format?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  visibility?: string | null;
};

type Props = {
  tournament: Tournament;
  rounds: BracketRound[];
  loserRounds: BracketRound[];
  isDoubleElim: boolean;
  hasFfaStage: boolean;
  seo: SeoProps;
};

/** Group a flat list of bracket matches into ordered rounds (mirror embed). */
function buildRounds(matches: ScheduleMatch[]): BracketRound[] {
  const roundMap = new Map<number, ScheduleMatch[]>();
  for (const m of matches) {
    const r = m.round_number ?? 0;
    if (!roundMap.has(r)) roundMap.set(r, []);
    roundMap.get(r)!.push(m);
  }
  return Array.from(roundMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([roundNum, roundMatches]) => ({
      roundNumber: roundNum,
      roundName:
        roundMatches[0]?.round_name ??
        (roundMatches.length === 1 ? 'Finale' : `Round ${roundNum}`),
      matches: roundMatches.sort(
        (a, b) => (a.position_in_round ?? 0) - (b.position_in_round ?? 0)
      ),
    }));
}

function buildBracketSeo(tournament: Tournament): SeoProps {
  const name = tournament.name;
  return {
    title: { fr: `Bracket – ${name}`, en: `Bracket – ${name}` },
    description: {
      fr: `Bracket du tournoi ${name} — OW Women's Cup : arbre d'élimination, progression des équipes et résultats manche par manche.`,
      en: `Bracket for the ${name} tournament — OW Women's Cup: elimination tree, team progression and round-by-round results.`,
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

  const tenantId = DEFAULT_TENANT_ID;

  const tournament = await findTournamentByIdOrSlug<Tournament>(
    id,
    'id, slug, name, game, status, format, start_date, end_date, visibility',
    tenantId
  );
  if (!tournament) {
    return { notFound: true, revalidate: 60 };
  }
  if (tournament.visibility && tournament.visibility !== 'public') {
    return { notFound: true, revalidate: 60 };
  }

  const [stagesResult, matchesResult] = await Promise.all([
    supabaseAdmin
      .from('tournament_stages')
      .select('stage_type')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournament.id),
    // Colonnes publiques, non-PII (même projection que la vue embed).
    supabaseAdmin
      .from('matches')
      .select(
        `
        id,
        tournament_id,
        stage_id,
        round_number,
        round_name,
        status,
        match_format,
        scheduled_at,
        team1_id,
        team2_id,
        team1_score,
        team2_score,
        is_bye,
        winner_team_id,
        notes,
        bracket_side,
        next_match_win_id,
        next_match_win_slot,
        team1:team1_id ( id, name, short_name, logo_url ),
        team2:team2_id ( id, name, short_name, logo_url )
      `
      )
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournament.id)
      .neq('status', 'cancelled')
      // `position_in_round` n'est PAS une colonne DB (cf. generateBracket.ts) :
      // l'ordre d'insertion (created_at) reflète la position dans le round.
      .order('round_number', { ascending: true })
      .order('created_at', { ascending: true }),
  ]);

  if (stagesResult.error)
    logger.error('bracket page stages error:', stagesResult.error);
  if (matchesResult.error)
    logger.error('bracket page matches error:', matchesResult.error);

  const stageTypes = (stagesResult.data || []) as { stage_type: string }[];
  const hasFfaStage = stageTypes.some((s) => s.stage_type === 'ffa');

  const matches = (matchesResult.data || []) as unknown as ScheduleMatch[];
  // Le bracket = uniquement les matchs d'élimination (wb/lb/final). Les matchs
  // hors bracket (saison régulière / swiss / poules, bracket_side 'none') vivent
  // dans la vue Matchs, pas ici → un tournoi sans bracket montre l'état vide.
  const bracketMatches = matches.filter(
    (m) =>
      m.bracket_side === 'wb' ||
      m.bracket_side === 'lb' ||
      m.bracket_side === 'final'
  );
  const isDoubleElim = bracketMatches.some((m) => m.bracket_side === 'lb');
  const mainMatches = bracketMatches.filter(
    (m) => m.bracket_side === 'wb' || m.bracket_side === 'final'
  );
  const lbMatches = bracketMatches.filter((m) => m.bracket_side === 'lb');

  return {
    props: {
      tournament: tournament as Tournament,
      rounds: buildRounds(mainMatches),
      loserRounds: buildRounds(lbMatches),
      isDoubleElim,
      hasFfaStage,
      seo: buildBracketSeo(tournament as Tournament),
    },
    revalidate: 60,
  };
};

export default function TournamentBracketPage({
  tournament,
  rounds,
  loserRounds,
  isDoubleElim,
  hasFfaStage,
}: Props) {
  const t = useT(nsTournamentBracket);
  const { lang } = useLang();
  const tournamentPath = `/tournament/${tournament.slug || tournament.id}`;
  const dateRangeLabel = formatDateRange(
    tournament.start_date,
    tournament.end_date,
    lang
  );
  const isCompleted =
    tournament.status === 'finished' || tournament.status === 'completed';
  const statusLabel = getStatusLabel(tournament.status, t);
  const statusColor = getStatusChipColor(tournament.status);
  const hasBracket = rounds.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="container mx-auto px-4 pt-24 pb-16 max-w-6xl">
        {/* Header */}
        <section className="mb-6">
          <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-white/5 border border-white/10 mb-3 text-[10px] uppercase tracking-wide">
            <span className="px-1.5 py-[2px] rounded-full bg-gradient-to-r from-[var(--color-violet)] to-[var(--color-green)] text-black font-semibold">
              OW Women&apos;s Cup
            </span>
            <span className="text-gray-200">
              {tournament.game || 'Overwatch'}
            </span>
            <span className="w-[1px] h-3 bg-white/20" />
            <span className={statusColor}>{statusLabel}</span>
          </div>

          <Heading typeStyle="heading-md" className="text-brand-gradient mb-1">
            {format(t.heading, { name: tournament.name })}
          </Heading>
          <span className="brand-rule mb-2" aria-hidden />
          {dateRangeLabel && (
            <p className="text-sm text-gray-300 mb-1">{dateRangeLabel}</p>
          )}
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
          active="bracket"
          showPodium={isCompleted}
          showFfa={hasFfaStage}
        />

        {/* Bracket */}
        <section>
          {!hasBracket ? (
            <div className="bg-black/60 border border-white/5 rounded-2xl p-8 text-center">
              <p className="text-lg font-semibold text-gray-100 mb-1">
                {t.emptyTitle}
              </p>
              <p className="text-sm text-gray-400 mb-4">{t.emptyBody}</p>
              <Link
                href={`${tournamentPath}/matches`}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--color-violet)] hover:bg-[var(--color-violet-deep)] px-4 py-2 text-sm font-medium text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
              >
                {t.viewMatches}
              </Link>
            </div>
          ) : (
            <div className="bg-black/60 border border-white/5 rounded-2xl p-3 sm:p-4 space-y-8">
              <div>
                {isDoubleElim && (
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-purple-300">
                    {t.winnersBracket}
                  </p>
                )}
                <BracketTreeView rounds={rounds} />
              </div>

              {isDoubleElim && loserRounds.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-rose-300">
                    {t.losersBracket}
                  </p>
                  <BracketTreeView rounds={loserRounds} />
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function getStatusLabel(status: string, t: BracketDict): string {
  switch (status) {
    case 'upcoming':
      return t.statusUpcoming;
    case 'running':
    case 'ongoing':
      return t.statusOngoing;
    case 'finished':
    case 'completed':
      return t.statusFinished;
    default:
      return status;
  }
}

function getStatusChipColor(status: string): string {
  switch (status) {
    case 'upcoming':
      return 'px-1.5 py-[2px] rounded-full bg-yellow-500/20 text-yellow-200 border border-yellow-500/60';
    case 'running':
    case 'ongoing':
      return 'px-1.5 py-[2px] rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-500/60';
    case 'finished':
    case 'completed':
      return 'px-1.5 py-[2px] rounded-full bg-gray-500/20 text-gray-200 border border-gray-500/60';
    default:
      return 'px-1.5 py-[2px] rounded-full bg-white/10 text-white border border-white/30';
  }
}
