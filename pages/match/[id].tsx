// pages/match/[id].tsx
 
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import Button from '@/components/Buttons/button';
import { supabaseAdmin } from '@/utils/supabase';

type MatchStatus = 'pending' | 'ongoing' | 'finished' | 'cancelled';
type BracketSide = 'wb' | 'lb' | 'final' | 'none';

type SimpleTeam = {
  id: string;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
};

type Tournament = {
  id: string;
  name: string;
  short_name?: string | null;
  game?: string | null;
};

type Stage = {
  id: string;
  name: string;
  stage_type: string;
};

type Game = {
  id: string;
  map_name: string | null;
  map_order: number | null;
  team1_score: number | null;
  team2_score: number | null;
  is_tiebreaker: boolean | null;
  went_overtime: boolean | null;
};

type Match = {
  id: string;
  tournament_id: string;
  stage_id: string | null;
  status: MatchStatus;
  is_bye: boolean | null;
  match_format: string | null;
  round_name: string | null;
  round_number: number | null;
  bracket_side: BracketSide;
  group_key: string | null;
  team1_score: number | null;
  team2_score: number | null;
  scheduled_at: string | null;
  completed_at: string | null;
  stream_url: string | null;
  lobby_code: string | null;
  notes: string | null;
  team1: SimpleTeam | null;
  team2: SimpleTeam | null;
  tournament: Tournament;
  stage: Stage | null;
  games: Game[];
};

type Props = {
  match: Match | null;
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const { id } = ctx.query;
  if (!id || Array.isArray(id)) {
    return { notFound: true };
  }

  const { data, error } = await supabaseAdmin
    .from('matches')
    .select(
      `
      id,
      tournament_id,
      stage_id,
      status,
      is_bye,
      match_format,
      round_name,
      round_number,
      bracket_side,
      group_key,
      team1_score,
      team2_score,
      scheduled_at,
      completed_at,
      stream_url,
      lobby_code,
      notes,
      team1:team1_id ( id, name, short_name, logo_url ),
      team2:team2_id ( id, name, short_name, logo_url ),
      tournament:tournament_id ( id, name, short_name, game ),
      stage:stage_id ( id, name, stage_type ),
      games (*)
    `
    )
    .eq('id', id)
    .single();

  if (error || !data) {
    console.error('match page error:', error);
    return { notFound: true };
  }

  const match = data as any as Match;

  // Tri des games par ordre
  match.games =
    match.games?.slice().sort((a: Game, b: Game) => {
      const oa = a.map_order ?? 0;
      const ob = b.map_order ?? 0;
      return oa - ob;
    }) ?? [];

  return {
    props: {
      match,
    },
  };
};

export default function MatchPage({ match }: Props) {
  if (!match) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p>Match introuvable.</p>
      </div>
    );
  }

  const t1 = match.team1;
  const t2 = match.team2;
  const isBye = match.is_bye;

  const t1Name = t1?.short_name || t1?.name || 'Équipe 1';
  const t2Name = t2?.short_name || t2?.name || (isBye ? '(bye)' : 'Équipe 2');

  const t1Logo = t1?.logo_url || null;
  const t2Logo = t2?.logo_url || null;

  const statusLabel = getMatchStatusLabel(match.status);
  const statusChipClass = getMatchStatusChipClass(match.status);
  const formatLabel = match.match_format?.toUpperCase() || 'BO?';
  const dateLabel = formatMatchDate(match.scheduled_at);
  const completedLabel = formatMatchDate(match.completed_at);

  const gameCount = match.games.length;

  const scoreLabel =
    match.status === 'finished' &&
    (match.team1_score !== null || match.team2_score !== null)
      ? `${match.team1_score ?? 0} - ${match.team2_score ?? 0}`
      : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <Head>
        <title>
          {t1Name} vs {t2Name} – {match.tournament.name} | OW Women&apos;s Cup
        </title>
      </Head>

      <main className="container mx-auto px-4 pt-24 pb-16 max-w-5xl">
        {/* Header / meta */}
        <section className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-white/5 border border-white/10 mb-3 text-[10px] uppercase tracking-wide">
                <span className="px-1.5 py-[2px] rounded-full bg-gradient-to-r from-pink-500/80 to-orange-400/80 text-black font-semibold">
                  OW Women&apos;s Cup
                </span>
                <span className="text-gray-200">
                  {match.tournament.game || 'Overwatch 2'}
                </span>
                <span className="w-[1px] h-3 bg-white/20" />
                <span className={statusChipClass}>{statusLabel}</span>
                <span className="w-[1px] h-3 bg-white/20" />
                <span className="px-1.5 py-[2px] rounded-full bg-black/60 border border-white/15 text-[9px] text-gray-300">
                  {formatLabel}
                </span>
              </div>

              <Heading typeStyle="heading-md" className="mb-1 text-gradient">
                {t1Name} {!isBye && <span className="text-gray-400">vs</span>}{' '}
                {t2Name}
              </Heading>

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-300 mb-1">
                <Link
                  href={`/tournament/${match.tournament.id}`}
                  className="hover:text-white"
                >
                  {match.tournament.short_name || match.tournament.name}
                </Link>
                {match.stage && (
                  <>
                    <span className="text-gray-500">·</span>
                    <span>{match.stage.name}</span>
                  </>
                )}
                {match.round_name && (
                  <>
                    <span className="text-gray-500">·</span>
                    <span>{match.round_name}</span>
                  </>
                )}
                {match.group_key && (
                  <>
                    <span className="text-gray-500">·</span>
                    <span>Poule {match.group_key}</span>
                  </>
                )}
              </div>

              <Paragraph typeStyle="body-sm" textColor="text-gray-200">
                Résumé complet du match, carte par carte : scores, overtimes,
                tiebreakers, et infos pratiques.
              </Paragraph>
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <Link href={`/tournament/${match.tournament.id}`}>
                <Button
                  type="button"
                  className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-blue-400"
                >
                  ← Tournoi
                </Button>
              </Link>
              <Link href={`/tournament/${match.tournament.id}/matches`}>
                <Button
                  type="button"
                  className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-emerald-400"
                >
                  Tous les matchs
                </Button>
              </Link>
              <Link href={`/tournament/${match.tournament.id}/bracket`}>
                <Button
                  type="button"
                  className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-purple-400"
                >
                  Bracket
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Score banner */}
        <section className="mb-6">
          <div className="bg-black/60 border border-white/10 rounded-2xl px-4 py-4">
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.5fr)_minmax(0,1.4fr)] gap-3 items-center">
              {/* Team 1 */}
              <TeamHeader team={t1} fallbackName="Équipe 1" align="left" />

              {/* Score & meta */}
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-xs text-gray-400 uppercase tracking-wide">
                    Score global
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-3xl font-semibold text-white">
                    {match.team1_score ?? 0}
                  </span>
                  <span className="text-lg text-gray-400">–</span>
                  <span className="text-3xl font-semibold text-white">
                    {match.team2_score ?? 0}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap justify-center gap-2 text-[10px] text-gray-400">
                  {dateLabel && <span>{dateLabel}</span>}
                  {completedLabel && (
                    <>
                      <span className="text-gray-600">·</span>
                      <span>Fin : {completedLabel}</span>
                    </>
                  )}
                  {gameCount > 0 && (
                    <>
                      <span className="text-gray-600">·</span>
                      <span>{gameCount} map(s) jouée(s)</span>
                    </>
                  )}
                </div>
              </div>

              {/* Team 2 */}
              <TeamHeader
                team={t2}
                fallbackName={isBye ? '(bye)' : 'Équipe 2'}
                align="right"
              />
            </div>
          </div>
        </section>

        {/* Maps list + extra info */}
        <section className="grid grid-cols-1 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1.3fr)] gap-6">
          {/* Maps */}
          <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-400">
                Détail par carte
              </p>
              {gameCount > 0 && (
                <span className="text-[10px] text-gray-500">
                  {gameCount} map
                  {gameCount > 1 ? 's' : ''} enregistrée
                  {gameCount > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {match.games.length === 0 && (
              <Paragraph typeStyle="body-sm" textColor="text-gray-300">
                Les détails par carte ne sont pas encore disponibles pour ce
                match.
              </Paragraph>
            )}

            {match.games.length > 0 && (
              <div className="space-y-2">
                {match.games.map((g, idx) => (
                  <MapRow
                    key={g.id}
                    index={idx}
                    game={g}
                    team1Name={t1Name}
                    team2Name={t2Name}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Extra infos */}
          <div className="space-y-4">
            <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">
                Infos match
              </p>

              <dl className="space-y-1 text-[11px]">
                <InfoRow
                  label="Tournoi"
                  value={
                    <Link
                      href={`/tournament/${match.tournament.id}`}
                      className="text-blue-300 hover:text-blue-100"
                    >
                      {match.tournament.short_name || match.tournament.name}
                    </Link>
                  }
                />
                {match.stage && (
                  <InfoRow label="Phase" value={match.stage.name} />
                )}
                {match.round_name && (
                  <InfoRow label="Round" value={match.round_name} />
                )}
                {match.group_key && (
                  <InfoRow label="Poule" value={match.group_key} />
                )}
                <InfoRow label="Format" value={formatLabel} />
                {match.lobby_code && (
                  <InfoRow
                    label="Lobby"
                    value={
                      <code className="bg-black/60 border border-white/10 rounded px-1.5 py-[1px] text-[10px]">
                        {match.lobby_code}
                      </code>
                    }
                  />
                )}
                {match.stream_url && (
                  <InfoRow
                    label="Stream"
                    value={
                      <a
                        href={match.stream_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-300 hover:text-emerald-100"
                      >
                        Voir le stream
                      </a>
                    }
                  />
                )}
                <InfoRow label="Bye" value={isBye ? 'Oui' : 'Non'} />
              </dl>
            </div>

            {match.notes && (
              <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
                <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">
                  Notes staff
                </p>
                <p className="text-[11px] text-gray-200 whitespace-pre-wrap">
                  {match.notes}
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * UI Components
 * ────────────────────────────────────────────*/

function TeamHeader({
  team,
  fallbackName,
  align,
}: {
  team: SimpleTeam | null;
  fallbackName: string;
  align: 'left' | 'right';
}) {
  const name = team?.short_name || team?.name || fallbackName;
  const fullName = team?.name || null;
  const logo = team?.logo_url || null;

  const containerClass =
    'flex items-center gap-3 ' +
    (align === 'right' ? 'justify-end text-right' : 'justify-start text-left');

  return (
    <div className={containerClass}>
      {align === 'left' && <TeamLogo logo={logo} name={name} />}

      <div className="flex flex-col">
        <span className="text-sm font-semibold text-white">
          {team ? (
            <Link href={`/team/${team.id}`} className="hover:text-emerald-300">
              {name}
            </Link>
          ) : (
            name
          )}
        </span>
        {fullName && fullName !== name && (
          <span className="text-[10px] text-gray-400">{fullName}</span>
        )}
      </div>

      {align === 'right' && <TeamLogo logo={logo} name={name} />}
    </div>
  );
}

function TeamLogo({ logo, name }: { logo: string | null; name: string }) {
  return (
    <div className="w-10 h-10 rounded-full bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden">
      {logo ? (
        <Image
          src={logo}
          alt={name}
          width={40}
          height={40}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-[10px] text-gray-400">{initials(name)}</span>
      )}
    </div>
  );
}

function MapRow({
  game,
  index,
  team1Name,
  team2Name,
}: {
  game: Game;
  index: number;
  team1Name: string;
  team2Name: string;
}) {
  const label = game.map_name || `Map ${index + 1}`;
  const orderLabel =
    typeof game.map_order === 'number'
      ? `#${game.map_order + 1}`
      : `#${index + 1}`;

  const s1 = game.team1_score ?? 0;
  const s2 = game.team2_score ?? 0;

  const isTiebreaker = !!game.is_tiebreaker;
  const isOT = !!game.went_overtime;

  return (
    <div className="rounded-xl border border-white/10 px-3 py-2 bg-white/3 text-[11px] flex flex-col gap-[2px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-[1px] rounded-full bg-black/60 border border-white/10 text-[9px] text-gray-300">
            {orderLabel}
          </span>
          <span className="text-gray-100 text-xs">{label}</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-gray-300">
          <span>{s1}</span>
          <span className="text-gray-500">-</span>
          <span>{s2}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-[10px] text-gray-300">
            {team1Name} vs {team2Name}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {isTiebreaker && (
            <span className="px-1.5 py-[1px] rounded-full bg-fuchsia-500/20 border border-fuchsia-400/70 text-[9px] text-fuchsia-100">
              Tiebreaker
            </span>
          )}
          {isOT && (
            <span className="px-1.5 py-[1px] rounded-full bg-amber-500/20 border border-amber-400/70 text-[9px] text-amber-100">
              Overtime
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-400">{label}</dt>
      <dd className="text-gray-100 text-right">{value}</dd>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Utils (cohérents avec les pages tournoi)
 * ────────────────────────────────────────────*/

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

function getMatchStatusLabel(status: MatchStatus): string {
  switch (status) {
    case 'pending':
      return 'À venir';
    case 'ongoing':
      return 'En cours';
    case 'finished':
      return 'Terminé';
    case 'cancelled':
      return 'Annulé';
    default:
      return status;
  }
}

function getMatchStatusChipClass(status: MatchStatus): string {
  switch (status) {
    case 'pending':
      return 'px-1.5 py-[2px] rounded-full bg-yellow-500/20 text-yellow-200 border border-yellow-500/60';
    case 'ongoing':
      return 'px-1.5 py-[2px] rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-500/60';
    case 'finished':
      return 'px-1.5 py-[2px] rounded-full bg-gray-500/20 text-gray-200 border border-gray-500/60';
    case 'cancelled':
      return 'px-1.5 py-[2px] rounded-full bg-red-500/20 text-red-200 border border-red-500/60';
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
