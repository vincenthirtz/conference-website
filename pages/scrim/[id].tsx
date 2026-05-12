// pages/scrim/[id].tsx
// Page publique : detail d'un scrim (par id ou slug) avec ses matchs.

import { GetServerSideProps } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import { supabaseAdmin } from '@/utils/supabase';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '../../utils/logger';

type TeamMini = {
  id: string;
  name: string;
  short_name: string | null;
  slug: string | null;
  logo_url: string | null;
};

type ScrimDetail = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  game: string | null;
  scheduled_date: string | null;
  timezone: string | null;
  description: string | null;
  banner_url: string | null;
  logo_url: string | null;
  stream_url: string | null;
  team1: TeamMini | null;
  team2: TeamMini | null;
};

type ScrimMatch = {
  id: string;
  status: string;
  is_bye: boolean | null;
  best_of: number | null;
  match_format: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  scheduled_at: string | null;
  stream_url: string | null;
  replay_url: string | null;
  team1: TeamMini | null;
  team2: TeamMini | null;
};

type Props = {
  scrim: ScrimDetail;
  matches: ScrimMatch[];
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const rawId = ctx.params?.id;
  const id = typeof rawId === 'string' ? rawId : '';
  if (!id || !supabaseAdmin) return { notFound: true };

  let scrimQuery = supabaseAdmin
    .from('scrims')
    .select(
      `
      id, name, slug, status, game,
      scheduled_date, timezone, description, banner_url, logo_url, stream_url,
      team1:teams!scrims_team1_id_fkey(id, name, short_name, slug, logo_url),
      team2:teams!scrims_team2_id_fkey(id, name, short_name, slug, logo_url)
      `
    )
    .eq('is_public', true)
    .neq('status', 'draft');

  scrimQuery = isValidUUID(id)
    ? scrimQuery.eq('id', id)
    : scrimQuery.eq('slug', id);

  const { data: scrim, error: scrimErr } = await scrimQuery.maybeSingle();
  if (scrimErr) {
    logger.error('[scrim/:id] fetch error:', scrimErr);
    return { notFound: true };
  }
  if (!scrim) return { notFound: true };

  const { data: matches } = await supabaseAdmin
    .from('matches')
    .select(
      `
      id, status, is_bye, best_of, match_format,
      team1_score, team2_score, winner_team_id,
      scheduled_at, stream_url, replay_url,
      team1:teams!matches_team1_id_fkey(id, name, short_name, slug, logo_url),
      team2:teams!matches_team2_id_fkey(id, name, short_name, slug, logo_url)
      `
    )
    .eq('scrim_id', scrim.id)
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  return {
    props: {
      scrim: scrim as unknown as ScrimDetail,
      matches: ((matches || []) as unknown) as ScrimMatch[],
    },
  };
};

function formatDate(d: string | null) {
  if (!d) return 'Date a definir';
  try {
    return new Date(d).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function ScrimDetailPage({ scrim, matches }: Props) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        <Link
          href="/scrims"
          className="text-sm text-neutral-400 hover:text-white"
        >
          ← Tous les scrims
        </Link>

        <Heading level="h1" className="!text-4xl md:!text-5xl mt-3">
          {scrim.name}
        </Heading>
        <Paragraph className="text-neutral-400 mt-2">
          {formatDate(scrim.scheduled_date)}
          {scrim.game ? ` · ${scrim.game}` : ''}
        </Paragraph>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-6 bg-neutral-800/50 border border-neutral-700/50 rounded-2xl p-6">
          <TeamBlock team={scrim.team1} />
          <span className="text-2xl text-neutral-500 font-semibold">vs</span>
          <TeamBlock team={scrim.team2} />
        </div>

        {scrim.description && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold mb-2">A propos</h2>
            <p className="text-neutral-300 whitespace-pre-line">
              {scrim.description}
            </p>
          </section>
        )}

        {scrim.stream_url && (
          <section className="mt-6">
            <a
              href={scrim.stream_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm font-medium"
            >
              Voir le stream →
            </a>
          </section>
        )}

        <section className="mt-10">
          <h2 className="text-lg font-semibold mb-3">
            Matchs ({matches.length})
          </h2>
          {matches.length === 0 ? (
            <p className="text-neutral-400 text-sm">
              Programme des matchs a venir.
            </p>
          ) : (
            <ul className="space-y-2">
              {matches.map((m, i) => (
                <li
                  key={m.id}
                  className="bg-neutral-800/50 border border-neutral-700/50 rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-neutral-500">
                      Match #{i + 1}
                    </span>
                    <span className="text-sm">
                      {(m.team1?.name || 'a definir') +
                        ' vs ' +
                        (m.team2?.name || 'a definir')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    {m.status === 'finished' ? (
                      <span className="font-mono">
                        {m.team1_score ?? 0} – {m.team2_score ?? 0}
                      </span>
                    ) : (
                      <span className="text-neutral-400 text-xs">
                        {m.scheduled_at
                          ? new Date(m.scheduled_at).toLocaleTimeString(
                              'fr-FR',
                              { hour: '2-digit', minute: '2-digit' }
                            )
                          : '—'}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-md text-xs bg-neutral-700">
                      {m.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function TeamBlock({ team }: { team: TeamMini | null }) {
  if (!team) {
    return (
      <div className="flex flex-col items-center gap-2 min-w-[120px]">
        <div className="w-16 h-16 rounded-xl bg-neutral-700/50" />
        <span className="text-neutral-400 italic text-sm">a definir</span>
      </div>
    );
  }
  return (
    <Link
      href={team.slug ? `/team/${team.slug}` : '#'}
      className="flex flex-col items-center gap-2 min-w-[120px] hover:opacity-80"
    >
      {team.logo_url ? (
        <Image
          src={team.logo_url}
          alt={team.name}
          width={64}
          height={64}
          className="rounded-xl"
        />
      ) : (
        <div className="w-16 h-16 rounded-xl bg-neutral-700 flex items-center justify-center text-lg font-bold">
          {(team.short_name || team.name).slice(0, 2)}
        </div>
      )}
      <span className="font-medium text-sm text-center">{team.name}</span>
    </Link>
  );
}

export default ScrimDetailPage;
