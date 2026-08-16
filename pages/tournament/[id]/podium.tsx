// pages/tournament/[id]/podium.tsx
// Page publique : podium officiel d'un tournoi terminé.
// Lit final_rankings (figé via /api/admin/tournament/[id]/finalize).
// 404 si le tournoi n'est pas dans status='completed' ou s'il n'a pas
// de rankings (cas où completed a été set manuellement sans finalize).

import { GetStaticPaths, GetStaticProps } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { findTournamentByIdOrSlug } from '@/utils/tournamentLookup';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import TournamentTabs from '@/components/tournament/TournamentTabs';
import { logger } from '../../../utils/logger';
import nsTournamentPodium from '@/lib/i18n/locales/fr/tournamentPodium';

type PodiumDict = typeof nsTournamentPodium.fr;

type Tournament = {
  id: string;
  slug: string | null;
  name: string;
  game: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  visibility: string | null;
};

type RankingRow = {
  team_id: string;
  rank: number;
  prize: string | null;
  notes: string | null;
  frozen_at: string;
  team_name: string;
  team_short_name: string | null;
  team_logo_url: string | null;
  team_slug: string | null;
};

type Props = {
  tournament: Tournament;
  rankings: RankingRow[];
  hasFfaStage: boolean;
  seo: SeoProps;
};

function buildPodiumSeo(tournament: Tournament): SeoProps {
  const name = tournament.name;
  return {
    title: { fr: `Podium – ${name}`, en: `Podium – ${name}` },
    description: {
      fr: `Podium officiel du tournoi ${name} — OW Women's Cup : classement final, équipes gagnantes et récompenses de la coupe féminine Overwatch.`,
      en: `Official podium of the ${name} tournament — OW Women's Cup: final standings, winning teams and prizes of the women's Overwatch cup.`,
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
    'id, slug, name, game, status, start_date, end_date, visibility',
    tenantId
  );
  if (!tournament) {
    return { notFound: true, revalidate: 60 };
  }
  if (tournament.visibility && tournament.visibility !== 'public') {
    return { notFound: true, revalidate: 60 };
  }
  if (tournament.status !== 'completed') {
    // Pas encore terminé : on ne montre pas de podium pour éviter de
    // pré-révéler un classement intermédiaire.
    return { notFound: true, revalidate: 60 };
  }

  if (!supabaseAdmin) {
    return { notFound: true, revalidate: 60 };
  }

  const [{ data: rankRows, error }, stagesRes] = await Promise.all([
    supabaseAdmin
      .from('final_rankings')
      .select(
        `
      team_id,
      rank,
      prize,
      notes,
      frozen_at,
      teams:teams!inner (
        name,
        short_name,
        logo_url,
        slug
      )
    `
      )
      .eq('tournament_id', tournament.id)
      .order('rank', { ascending: true }),
    supabaseAdmin
      .from('tournament_stages')
      .select('stage_type')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournament.id),
  ]);

  if (error) {
    logger.error('public podium page query error:', error);
  }

  const hasFfaStage = (stagesRes.data || []).some(
    (s: any) => s.stage_type === 'ffa'
  );

  if (!rankRows || rankRows.length === 0) {
    return { notFound: true, revalidate: 60 };
  }

  const rankings: RankingRow[] = (rankRows as any[]).map((r) => ({
    team_id: r.team_id,
    rank: r.rank,
    prize: r.prize,
    notes: r.notes,
    frozen_at: r.frozen_at,
    team_name: r.teams?.name ?? 'Équipe inconnue',
    team_short_name: r.teams?.short_name ?? null,
    team_logo_url: r.teams?.logo_url ?? null,
    team_slug: r.teams?.slug ?? null,
  }));

  return {
    props: {
      tournament,
      rankings,
      hasFfaStage,
      seo: buildPodiumSeo(tournament),
    },
    revalidate: 60,
  };
};

const getMedal = (
  t: PodiumDict
): Record<number, { emoji: string; label: string; color: string }> => ({
  1: {
    emoji: '🥇',
    label: t.medalFirst,
    color: 'from-amber-400 to-yellow-600',
  },
  2: {
    emoji: '🥈',
    label: t.medalSecond,
    color: 'from-neutral-200 to-neutral-400',
  },
  3: {
    emoji: '🥉',
    label: t.medalThird,
    color: 'from-orange-500 to-amber-700',
  },
});

export default function TournamentPodiumPage({
  tournament,
  rankings,
  hasFfaStage,
}: Props) {
  const t = useT(nsTournamentPodium);
  const locale = useLocale();
  const tournamentPath = `/tournament/${tournament.slug ?? tournament.id}`;
  const isCompleted =
    tournament.status === 'finished' || tournament.status === 'completed';
  const MEDAL = getMedal(t);
  const top3 = rankings.filter((r) => r.rank <= 3);
  const rest = rankings.filter((r) => r.rank > 3);

  const frozenAtIso = rankings[0]?.frozen_at;
  const frozenAtLabel = frozenAtIso
    ? new Date(frozenAtIso).toLocaleDateString(locale, {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <main className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-black text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        <div className="flex flex-col items-center text-center mb-10">
          <p className="text-xs uppercase tracking-widest text-[var(--color-yellow)] mb-2">
            {t.eyebrow}
          </p>
          <Heading level="h1" className="text-brand-gradient">
            {tournament.name}
          </Heading>
          <span className="brand-rule mt-3" aria-hidden />
          {frozenAtLabel && (
            <Paragraph className="text-neutral-400 mt-2">
              {format(t.closedOn, { date: frozenAtLabel })}
            </Paragraph>
          )}
        </div>

        <TournamentTabs
          tournamentPath={tournamentPath}
          active="podium"
          showPodium={isCompleted}
          showFfa={hasFfaStage}
        />

        {top3.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
            {[2, 1, 3]
              .map((rank) => top3.find((r) => r.rank === rank))
              .filter((r): r is RankingRow => Boolean(r))
              .map((r) => {
                const medal = MEDAL[r.rank];
                const isFirst = r.rank === 1;
                return (
                  <div
                    key={r.team_id}
                    className={`relative rounded-2xl border border-neutral-800 bg-gradient-to-b ${medal?.color ?? 'from-neutral-800 to-neutral-900'} p-1 ${
                      isFirst ? 'sm:-mt-4 sm:scale-105' : ''
                    }`}
                  >
                    <div className="rounded-xl bg-neutral-950/85 px-4 py-6 h-full flex flex-col items-center text-center">
                      <div className="text-4xl mb-2">{medal?.emoji}</div>
                      <div className="text-xs uppercase tracking-wide text-neutral-400 mb-3">
                        {medal?.label}
                      </div>
                      {r.team_logo_url ? (
                        <div className="relative w-16 h-16 mb-3">
                          <Image
                            src={r.team_logo_url}
                            alt={r.team_name}
                            fill
                            sizes="64px"
                            className="object-contain"
                          />
                        </div>
                      ) : (
                        <div className="w-16 h-16 mb-3 rounded-full bg-neutral-800 flex items-center justify-center text-xl font-bold">
                          {r.team_short_name?.[0] ?? r.team_name[0]}
                        </div>
                      )}
                      {r.team_slug ? (
                        <Link
                          href={`/team/${r.team_slug}`}
                          className="font-bold text-lg hover:text-[var(--color-yellow)]"
                        >
                          {r.team_name}
                        </Link>
                      ) : (
                        <span className="font-bold text-lg">{r.team_name}</span>
                      )}
                      {r.prize && (
                        <div className="mt-2 text-sm text-[var(--color-yellow-light)]">
                          {r.prize}
                        </div>
                      )}
                      {r.notes && (
                        <div className="mt-1 text-xs text-neutral-500">
                          {r.notes}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {rest.length > 0 && (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900/80 text-xs uppercase text-neutral-400">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left w-16">
                    {t.colRank}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    {t.colTeam}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    {t.colPrize}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    {t.colNotes}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rest.map((r) => (
                  <tr
                    key={r.team_id}
                    className="border-t border-neutral-800/60"
                  >
                    <td className="px-4 py-2 font-mono text-neutral-300">
                      #{r.rank}
                    </td>
                    <td className="px-4 py-2 flex items-center gap-3">
                      {r.team_logo_url ? (
                        <Image
                          src={r.team_logo_url}
                          alt={r.team_name}
                          width={24}
                          height={24}
                          className="object-contain"
                        />
                      ) : null}
                      {r.team_slug ? (
                        <Link
                          href={`/team/${r.team_slug}`}
                          className="hover:text-[var(--color-yellow)]"
                        >
                          {r.team_name}
                        </Link>
                      ) : (
                        <span>{r.team_name}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-neutral-300">
                      {r.prize ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-neutral-500">
                      {r.notes ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
