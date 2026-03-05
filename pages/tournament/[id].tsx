// pages/tournament/[id].tsx
 
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useMemo } from 'react';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import Button from '@/components/Buttons/button';
import { supabaseAdmin } from '@/utils/supabase';

type Tournament = {
  id: string;
  name: string;
  short_name?: string | null;
  slug?: string | null;
  game?: string | null;
  status: string;
  format?: string | null;
  max_teams?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  rules_url?: string | null;
  visibility?: string | null;
  created_at: string;
  updated_at: string;
};

type Stage = {
  id: string;
  tournament_id: string;
  name: string;
  stage_type: string;
  default_match_format?: string | null;
  swiss_rounds?: number | null;
  bracket_format?: string | null;
  visible?: boolean | null;
};

type SimpleTeam = {
  id: string;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
};

type MatchStatus = 'pending' | 'ongoing' | 'finished' | 'cancelled';

type SimpleMatch = {
  id: string;
  scheduled_at: string | null;
  completed_at: string | null;
  status: MatchStatus;
  is_bye: boolean | null;
  round_name: string | null;
  round_number: number | null;
  match_format: string | null;
  team1_score: number | null;
  team2_score: number | null;
  team1: SimpleTeam | null;
  team2: SimpleTeam | null;
  stage: {
    id: string;
    name: string;
    stage_type: string;
  } | null;
};

type TournamentPageProps = {
  tournament: Tournament;
  stages: Stage[];
  teams: SimpleTeam[];
  matches: SimpleMatch[];
};

const STAGE_TYPES: Record<string, string> = {
  group: 'Poule',
  bracket: 'Bracket',
  swiss: 'Swiss',
  round_robin: 'Round robin',
  showmatch: 'Showmatch',
  other: 'Autre',
};

function formatStageType(stageType: string | null | undefined) {
  if (!stageType) return 'Autre';
  return STAGE_TYPES[stageType] || stageType;
}

export const getServerSideProps: GetServerSideProps<
  TournamentPageProps
> = async (ctx) => {
  const { id: rawId } = ctx.query;
  if (!rawId || Array.isArray(rawId)) {
    return { notFound: true };
  }

  const asString = String(rawId);
  const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
    asString
  );

  // 1) Tournoi (accept both uuid id and slug)
  let tournament: Tournament | null = null;

  if (isUuid) {
    const { data, error } = await supabaseAdmin
      .from('tournaments')
      .select('*')
      .eq('id', asString)
      .single();
    if (!error && data) {
      tournament = data as Tournament;
    }
  }

  if (!tournament) {
    const { data } = await supabaseAdmin
      .from('tournaments')
      .select('*')
      .eq('slug', asString)
      .single();
    if (data) {
      tournament = data as Tournament;
    }
  }

  if (!tournament) {
    return { notFound: true };
  }

  // Si visibilité non publique, tu peux choisir de renvoyer 404
  if (tournament.visibility && tournament.visibility !== 'public') {
    return { notFound: true };
  }

  const tournamentId = tournament.id;

  // 2) Stages
  const { data: stages, error: sErr } = await supabaseAdmin
    .from('tournament_stages')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true });

  if (sErr) {
    console.error('tournament stages error:', sErr);
  }

  // 3) Matches (limités)
  const { data: matchesData, error: mErr } = await supabaseAdmin
    .from('matches')
    .select(
      `
      id,
      scheduled_at,
      status,
      is_bye,
      round_name,
      round_number,
      match_format,
      team1_score,
      team2_score,
      team1:team1_id ( id, name, short_name, logo_url ),
      team2:team2_id ( id, name, short_name, logo_url ),
      stage:tournament_stages ( id, name, stage_type )
    `
    )
    .eq('tournament_id', tournamentId)
    .neq('status', 'cancelled')
    .order('scheduled_at', { ascending: false })
    .limit(40);

  if (mErr) {
    console.error('tournament matches error:', mErr);
  }

  const matches = (matchesData || []) as any as SimpleMatch[];

  // 4) Teams (à partir des stage_teams)
  let teams: SimpleTeam[] = [];

  if (stages && stages.length > 0) {
    const stageIds = stages.map((s: any) => s.id);
    const { data: stageTeams, error: stErr } = await supabaseAdmin
      .from('tournament_stage_teams')
      .select(
        `
        team:teams ( id, name, short_name, logo_url )
      `
      )
      .in('stage_id', stageIds);

    if (stErr) {
      console.error('tournament stage teams error:', stErr);
    } else {
      const map = new Map<string, SimpleTeam>();
      (stageTeams || []).forEach((row: any) => {
        if (!row.team) return;
        map.set(row.team.id, row.team);
      });
      teams = Array.from(map.values());
    }
  }

  return {
    props: {
      tournament,
      stages: (stages || []) as any,
      teams,
      matches,
    },
  };
};

export default function TournamentPage({
  tournament,
  stages,
  teams,
  matches,
}: TournamentPageProps) {
  const totalTeams = teams.length;
  const now = useMemo(() => new Date(), []);
  const finishedMatches = matches.filter((m) => m.status === 'finished');
  const totalMatches = matches.length;

  const upcomingMatches = useMemo(
    () =>
      matches
        .filter(
          (m) =>
            (m.status === 'pending' || m.status === 'ongoing') &&
            m.scheduled_at &&
            new Date(m.scheduled_at) >= now
        )
        .slice(0, 6),
    [matches, now]
  );

  const recentMatches = useMemo(
    () =>
      finishedMatches
        .sort((a, b) => {
          const da = a.completed_at
            ? new Date(a.completed_at)
            : a.scheduled_at
              ? new Date(a.scheduled_at)
              : new Date(0);
          const db = b.completed_at
            ? new Date(b.completed_at)
            : b.scheduled_at
              ? new Date(b.scheduled_at)
              : new Date(0);
          return db.getTime() - da.getTime();
        })
        .slice(0, 6),
    [finishedMatches]
  );

  const mainStage = stages[0];

  const dateRangeLabel = formatTournamentDates(
    tournament.start_date,
    tournament.end_date
  );

  const statusLabel = getStatusLabel(tournament.status);
  const statusColor = getStatusChipColor(tournament.status);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <Head>
        <title>{tournament.name} | OW Women&apos;s Cup</title>
      </Head>

      <main className="container mx-auto px-4 pt-24 pb-16 max-w-6xl">
        {/* HERO */}
        <section className="mb-10">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)] gap-6 items-start">
            {/* Left: title + description */}
            <div>
              <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-white/5 border border-white/10 mb-4 text-[10px] uppercase tracking-wide">
                <span className="px-1.5 py-[2px] rounded-full bg-gradient-to-r from-pink-500/80 to-orange-400/80 text-black font-semibold">
                  OW Women&apos;s Cup
                </span>
                <span className="text-gray-200">
                  {tournament.game || 'Overwatch 2'}
                </span>
                <span className="w-[1px] h-3 bg-white/20" />
                <span className={statusColor}>{statusLabel}</span>
              </div>

              <Heading typeStyle="heading-lg" className="text-gradient mb-1">
                {tournament.name}
              </Heading>

              {dateRangeLabel && (
                <p className="text-sm text-gray-300 mb-2">
                  {dateRangeLabel}
                  {tournament.format && (
                    <>
                      {' '}
                      ·{' '}
                      <span className="text-gray-100">{tournament.format}</span>
                    </>
                  )}
                </p>
              )}

              <Paragraph
                typeStyle="body-lg"
                textColor="text-gray-200"
                className="max-w-xl"
              >
                Suivez le bracket, les résultats, les maps et les équipes de
                cette édition de la OW Women&apos;s Cup. Tout ce qu&apos;il faut
                pour caster, analyser ou simplement vibrer avec le tournoi.
              </Paragraph>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link href={`/tournament/${tournament.id}/bracket`}>
                  <Button
                    type="button"
                    className="px-5 py-2 text-xs font-semibold rounded-full bg-white text-black hover:bg-gray-100"
                  >
                    Voir le bracket
                  </Button>
                </Link>

                <Link href={`/tournament/${tournament.id}/matches`}>
                  <Button
                    type="button"
                    className="px-5 py-2 text-xs font-semibold rounded-full bg-transparent border border-white/40 hover:border-emerald-400"
                  >
                    Tous les matchs
                  </Button>
                </Link>

                <Link href={`/tournament/${tournament.id}/maps`}>
                  <Button
                    type="button"
                    className="px-5 py-2 text-xs font-semibold rounded-full bg-transparent border border-white/30 hover:border-blue-400"
                  >
                    Top maps
                  </Button>
                </Link>
              </div>

              {tournament.rules_url && (
                <div className="mt-3">
                  <a
                    href={tournament.rules_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-gray-300 hover:text-white"
                  >
                    📜 Règlement du tournoi
                  </a>
                </div>
              )}
            </div>

            {/* Right: stats cards */}
            <div className="grid grid-cols-2 gap-2 md:gap-3">
              <StatCard
                label="Équipes"
                value={totalTeams || '—'}
                hint={
                  tournament.max_teams
                    ? `${totalTeams}/${tournament.max_teams} inscrites`
                    : undefined
                }
              />
              <StatCard
                label="Matchs"
                value={totalMatches || '—'}
                hint={
                  totalMatches > 0
                    ? `${finishedMatches.length} terminés`
                    : undefined
                }
              />
              <StatCard
                label="Stages"
                value={stages.length || '—'}
                hint={mainStage ? mainStage.name : undefined}
              />
              <StatCard
                label="Format"
                value={tournament.format || '—'}
                hint={tournament.game || undefined}
              />
            </div>
          </div>
        </section>

        {/* STAGES + UPDATES */}
        <section className="mb-10 grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.7fr)] gap-6">
          {/* Stages overview */}
          <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-400">
                Phases du tournoi
              </p>
              {stages.length > 0 && (
                <span className="text-[11px] text-gray-500">
                  {stages.length} phase
                  {stages.length > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {stages.length === 0 && (
              <Paragraph typeStyle="body-sm" textColor="text-gray-400">
                Les phases de ce tournoi ne sont pas encore publiées.
              </Paragraph>
            )}

            {stages.length > 0 && (
              <ul className="space-y-2">
                {stages.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-start justify-between gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2"
                  >
                    <div>
                      <p className="text-xs font-semibold text-white">
                        {s.name}
                      </p>
                      <p className="text-[11px] text-gray-300">
                        {formatStageType(s.stage_type)}{' '}
                        {s.stage_type === 'swiss' && s.swiss_rounds
                          ? `· ${s.swiss_rounds} rounds`
                          : ''}
                      </p>
                      {s.default_match_format && (
                        <p className="text-[10px] text-gray-500">
                          Format par défaut : {s.default_match_format}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 text-[10px]">
                      <Link href={`/tournament/${tournament.id}/bracket`}>
                        <span className="px-2 py-1 rounded-full border border-purple-400/60 text-purple-100 bg-purple-900/30 hover:bg-purple-900/50 cursor-pointer">
                          Bracket
                        </span>
                      </Link>
                      {/* Si tu as une page dédiée stage: /admin ou /tournament/... */}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Upcoming / recent matches */}
          <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-400">
                Matches clés
              </p>
              <Link href={`/tournament/${tournament.id}/matches`}>
                <span className="text-[11px] text-blue-300 hover:text-blue-100 cursor-pointer">
                  Voir tous les matchs →
                </span>
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Upcoming */}
              <div>
                <p className="text-[11px] text-gray-400 mb-1">
                  Prochains matchs
                </p>
                <div className="space-y-2">
                  {upcomingMatches.length === 0 && (
                    <p className="text-[11px] text-gray-500">
                      Aucun match à venir n&apos;est programmé pour
                      l&apos;instant.
                    </p>
                  )}
                  {upcomingMatches.map((m) => (
                    <MatchLine key={m.id} match={m} compact />
                  ))}
                </div>
              </div>

              {/* Recent */}
              <div>
                <p className="text-[11px] text-gray-400 mb-1">
                  Derniers résultats
                </p>
                <div className="space-y-2">
                  {recentMatches.length === 0 && (
                    <p className="text-[11px] text-gray-500">
                      Aucun résultat publié pour le moment.
                    </p>
                  )}
                  {recentMatches.map((m) => (
                    <MatchLine key={m.id} match={m} compact showScore />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* TEAMS + MAPS */}
        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1.3fr)] gap-6">
          {/* Teams */}
          <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-400">
                Équipes du tournoi
              </p>
              {totalTeams > 0 && (
                <span className="text-[11px] text-gray-500">
                  {totalTeams} équipe
                  {totalTeams > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {totalTeams === 0 && (
              <Paragraph typeStyle="body-sm" textColor="text-gray-400">
                Les équipes ne sont pas encore affichées pour ce tournoi.
              </Paragraph>
            )}

            {totalTeams > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {teams.slice(0, 12).map((team) => (
                  <Link key={team.id} href={`/team/${team.id}`}>
                    <div className="group flex flex-col items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-2 py-3 cursor-pointer hover:border-emerald-400/70 hover:bg-emerald-500/10 transition-colors">
                      <div className="w-12 h-12 rounded-full bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden">
                        {team.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={team.logo_url}
                            alt={team.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-[10px] text-gray-400">
                            {initials(team.short_name || team.name)}
                          </span>
                        )}
                      </div>
                      <div className="text-center">
                        <p className="text-[11px] font-semibold text-white truncate max-w-[100px]">
                          {team.short_name || team.name}
                        </p>
                        <p className="text-[10px] text-gray-400 truncate max-w-[100px]">
                          {team.name}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}

                {totalTeams > 12 && (
                  <div className="flex items-center justify-center text-[11px] text-gray-400">
                    + {totalTeams - 12} autres…
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Maps highlight */}
          <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-400">
                Aperçu des maps
              </p>
              <Link href={`/tournament/${tournament.id}/maps`}>
                <span className="text-[11px] text-blue-300 hover:text-blue-100 cursor-pointer">
                  Voir toutes les maps →
                </span>
              </Link>
            </div>

            <Paragraph
              typeStyle="body-sm"
              textColor="text-gray-300"
              className="mb-3"
            >
              Consultez les cartes les plus jouées du tournoi, les overtimes et
              les tiebreakers pour analyser la meta des maps.
            </Paragraph>

            {/* Mini "fake" list – tu peux plus tard brancher un fetch vers /api/tournament/[id]/maps et afficher les top 3 */}
            <div className="border border-white/10 rounded-xl px-3 py-2 text-[11px] text-gray-400">
              <p>
                Les stats détaillées (popularité, overtimes, rounds moyens) sont
                visibles sur la page{' '}
                <span className="text-blue-300">Top maps</span>.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Components & utils locaux
 * ────────────────────────────────────────────*/

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-white/8 via-white/5 to-white/0 border border-white/10 px-3 py-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">
        {label}
      </p>
      <p className="text-xl font-semibold text-white">
        {typeof value === 'number' ? value.toString() : value}
      </p>
      {hint && <p className="text-[10px] text-gray-400 mt-[2px]">{hint}</p>}
    </div>
  );
}

function MatchLine({
  match,
  compact,
  showScore,
}: {
  match: SimpleMatch;
  compact?: boolean;
  showScore?: boolean;
}) {
  const t1 = match.team1?.short_name || match.team1?.name || 'Équipe 1';
  const t2 =
    match.team2?.short_name ||
    match.team2?.name ||
    (match.is_bye ? '(bye)' : 'Équipe 2');

  const when = formatMatchDate(match.scheduled_at);
  const isFinished = match.status === 'finished';

  let scoreLabel = '';
  if (showScore && isFinished) {
    const s1 = match.team1_score ?? 0;
    const s2 = match.team2_score ?? 0;
    scoreLabel = `${s1} - ${s2}`;
  }

  return (
    <Link href={`/match/${match.id}`}>
      <div className="group flex flex-col gap-[2px] px-2 py-1.5 rounded-xl bg-white/3 border border-white/10 hover:border-emerald-400/70 hover:bg-emerald-500/5 cursor-pointer transition-colors text-[11px]">
        <div className="flex items-center justify-between gap-1">
          <p className="text-gray-100 truncate">
            {t1}{' '}
            {!match.is_bye && (
              <>
                <span className="text-gray-500">vs</span> {t2}
              </>
            )}
            {match.is_bye && <span className="text-gray-500"> (bye)</span>}
          </p>
          {match.match_format && (
            <span className="px-1.5 py-[1px] rounded-full bg-black/60 border border-white/10 text-[9px] text-gray-300">
              {match.match_format.toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[10px] text-gray-400">
            {when && <span>{when}</span>}
            {match.round_name && (
              <>
                <span className="text-gray-600">·</span>
                <span>{match.round_name}</span>
              </>
            )}
            {match.stage && (
              <>
                <span className="text-gray-600">·</span>
                <span className="text-gray-500">{match.stage.name}</span>
              </>
            )}
          </div>
          {scoreLabel && (
            <span className="text-[10px] font-semibold text-emerald-300">
              {scoreLabel}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function formatTournamentDates(
  start?: string | null,
  end?: string | null
): string | null {
  if (!start && !end) return null;

  const opts: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
  };

  if (start && end) {
    const s = new Date(start);
    const e = new Date(end);
    if (s.getTime() === e.getTime()) {
      return `Le ${s.toLocaleDateString('fr-FR', opts)}`;
    }
    return `Du ${s.toLocaleDateString(
      'fr-FR',
      opts
    )} au ${e.toLocaleDateString('fr-FR', opts)}`;
  }

  if (start) {
    const s = new Date(start);
    return `À partir du ${s.toLocaleDateString('fr-FR', opts)}`;
  }

  const e = new Date(end!);
  return `Jusqu'au ${e.toLocaleDateString('fr-FR', opts)}`;
}

function formatMatchDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'upcoming':
      return 'À venir';
    case 'running':
    case 'ongoing':
      return 'En cours';
    case 'finished':
    case 'completed':
      return 'Terminé';
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
