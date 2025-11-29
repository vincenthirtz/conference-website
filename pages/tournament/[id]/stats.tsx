// pages/tournament/[id]/stats.tsx
/* eslint-disable react/no-unescaped-entities */
import { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import Heading from "@/components/Typography/heading";
import Paragraph from "@/components/Typography/paragraph";
import Button from "@/components/Buttons/button";
import { supabaseAdmin } from "@/utils/supabase";

type Tournament = {
  id: string;
  name: string;
  short_name?: string | null;
  game?: string | null;
  status: string;
  format?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  visibility?: string | null;
};

type SimpleTeam = {
  id: string;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
};

type MatchRow = {
  id: string;
  status: string;
  is_bye: boolean | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
};

type GameRow = {
  match_id: string;
  team1_score: number | null;
  team2_score: number | null;
};

type TeamStat = {
  teamId: string;
  teamName: string;
  teamShortName?: string | null;
  logoUrl?: string | null;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winrate: number; // 0–1
  mapsWon: number;
  mapsLost: number;
  mapDiff: number;
};

type Props = {
  tournament: Tournament;
  teamStats: TeamStat[];
};

export const getServerSideProps: GetServerSideProps<Props> = async (
  ctx
) => {
  const { id } = ctx.query;
  if (!id || Array.isArray(id)) {
    return { notFound: true };
  }

  // 1) Tournoi
  const { data: tournament, error: tErr } = await supabaseAdmin
    .from("tournaments")
    .select("*")
    .eq("id", id)
    .single();

  if (tErr || !tournament) {
    return { notFound: true };
  }

  if (tournament.visibility && tournament.visibility !== "public") {
    return { notFound: true };
  }

  // 2) Récupérer les équipes engagées via tournament_stage_teams
  const { data: stageTeams, error: stErr } = await supabaseAdmin
    .from("tournament_stage_teams")
    .select(
      `
      team:teams (
        id,
        name,
        short_name,
        logo_url
      )
    `
    )
    .eq("stage_id.tournament_id", id); // si Supabase râle, remplace par un .in sur stage_id

  if (stErr) {
    console.error("stats page stage_teams error:", stErr);
  }

  const teamMap = new Map<string, SimpleTeam>();
  (stageTeams || []).forEach((row: any) => {
    if (!row.team) return;
    teamMap.set(row.team.id, row.team);
  });

  const teams = Array.from(teamMap.values());
  const teamIds = teams.map((t) => t.id);

  // S'il n'y a aucune équipe, pas la peine d'aller plus loin
  if (teamIds.length === 0) {
    return {
      props: {
        tournament: tournament as Tournament,
        teamStats: [],
      },
    };
  }

  // 3) Matches du tournoi (on exclut les annulés & BYE des stats "compétitives")
  const { data: matchesData, error: mErr } = await supabaseAdmin
    .from("matches")
    .select(
      "id, status, is_bye, team1_id, team2_id, winner_team_id"
    )
    .eq("tournament_id", id)
    .neq("status", "cancelled");

  if (mErr) {
    console.error("stats page matches error:", mErr);
  }

  const matches = ((matchesData || []) as MatchRow[]).filter(
    (m) => !m.is_bye
  );

  const matchIds = matches.map((m) => m.id);
  let games: GameRow[] = [];

  if (matchIds.length > 0) {
    // 4) Games de ces matches
    const { data: gamesData, error: gErr } = await supabaseAdmin
      .from("games")
      .select("match_id, team1_score, team2_score")
      .in("match_id", matchIds);

    if (gErr) {
      console.error("stats page games error:", gErr);
    } else {
      games = (gamesData || []) as GameRow;
    }
  }

  const teamStats = computeTeamStats(teams, matches, games);

  return {
    props: {
      tournament: tournament as Tournament,
      teamStats,
    },
  };
};

export default function TournamentStatsPage({
  tournament,
  teamStats,
}: Props) {
  const dateRangeLabel = formatTournamentDates(
    tournament.start_date,
    tournament.end_date
  );
  const statusLabel = getStatusLabel(tournament.status);
  const statusColor = getStatusChipColor(tournament.status);

  const totalTeams = teamStats.length;
  const totalMatches = teamStats.reduce(
    (acc, t) => acc + t.matchesPlayed,
    0
  );

  const sortedByWinrate = [...teamStats].sort((a, b) => {
    if (b.winrate !== a.winrate) {
      return b.winrate - a.winrate;
    }
    return b.matchesPlayed - a.matchesPlayed;
  });

  const topTeams = sortedByWinrate.slice(0, 3);

  const bestMapDiff = [...teamStats].sort(
    (a, b) => b.mapDiff - a.mapDiff
  )[0];

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <Head>
        <title>
          Stats équipes – {tournament.name} | OW Women&apos;s Cup
        </title>
      </Head>

      <main className="container mx-auto px-4 pt-24 pb-16 max-w-6xl">
        {/* Header */}
        <section className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-white/5 border border-white/10 mb-3 text-[10px] uppercase tracking-wide">
                <span className="px-1.5 py-[2px] rounded-full bg-gradient-to-r from-pink-500/80 to-orange-400/80 text-black font-semibold">
                  OW Women&apos;s Cup
                </span>
                <span className="text-gray-200">
                  {tournament.game || "Overwatch 2"}
                </span>
                <span className="w-[1px] h-3 bg-white/20" />
                <span className={statusColor}>{statusLabel}</span>
              </div>

              <Heading
                typeStyle="heading-md"
                className="text-gradient mb-1"
              >
                Stats équipes – {tournament.name}
              </Heading>
              {dateRangeLabel && (
                <p className="text-sm text-gray-300 mb-1">
                  {dateRangeLabel}
                  {tournament.format && (
                    <>
                      {" "}
                      ·{" "}
                      <span className="text-gray-100">
                        {tournament.format}
                      </span>
                    </>
                  )}
                </p>
              )}
              <Paragraph
                typeStyle="body-sm"
                textColor="text-gray-200"
                className="max-w-xl"
              >
                Classement des équipes sur ce tournoi selon leurs
                victoires, leur différence de maps et leur
                régularité. Parfait pour préparer un cast ou une
                analyse desk.
              </Paragraph>
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <Link href={`/tournament/${tournament.id}`}>
                <Button
                  type="button"
                  className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-blue-400"
                >
                  ← Retour au tournoi
                </Button>
              </Link>
              <Link href={`/tournament/${tournament.id}/matches`}>
                <Button
                  type="button"
                  className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-emerald-400"
                >
                  Tous les matchs
                </Button>
              </Link>
              <Link href={`/tournament/${tournament.id}/maps`}>
                <Button
                  type="button"
                  className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-purple-400"
                >
                  Top maps
                </Button>
              </Link>
              <Link href={`/tournament/${tournament.id}/bracket`}>
                <Button
                  type="button"
                  className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-pink-400"
                >
                  Bracket
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Stats globales */}
        <section className="mb-6">
          <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
            {teamStats.length === 0 && (
              <Paragraph
                typeStyle="body-sm"
                textColor="text-gray-300"
              >
                Aucune statistique n&apos;est disponible pour ce
                tournoi pour l&apos;instant. Les stats apparaîtront dès que
                des matchs auront été joués et enregistrés.
              </Paragraph>
            )}

            {teamStats.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                  label="Équipes"
                  value={totalTeams}
                />
                <StatCard
                  label="Matchs joués"
                  value={Math.round(totalMatches / 2)}
                  hint={`${totalMatches} participations au total`}
                />
                <StatCard
                  label="Top winrate"
                  value={
                    topTeams[0]
                      ? `${(topTeams[0].winrate * 100).toFixed(
                          0
                        )}%`
                      : "—"
                  }
                  hint={
                    topTeams[0]
                      ? topTeams[0].teamShortName ||
                        topTeams[0].teamName
                      : undefined
                  }
                />
                <StatCard
                  label="Meilleure diff maps"
                  value={
                    bestMapDiff
                      ? bestMapDiff.mapDiff > 0
                        ? `+${bestMapDiff.mapDiff}`
                        : bestMapDiff.mapDiff.toString()
                      : "—"
                  }
                  hint={
                    bestMapDiff
                      ? bestMapDiff.teamShortName ||
                        bestMapDiff.teamName
                      : undefined
                  }
                />
              </div>
            )}
          </div>
        </section>

        {/* Top teams */}
        {topTeams.length > 0 && (
          <section className="mb-6">
            <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">
                Top 3 équipes du tournoi
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {topTeams.map((t, index) => (
                  <TopTeamCard
                    key={t.teamId}
                    rank={index + 1}
                    stat={t}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Tableau complet */}
        {teamStats.length > 0 && (
          <section>
            <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-3">
                Classement complet des équipes
              </p>

              <div className="overflow-x-auto">
                <table className="min-w-full text-[11px]">
                  <thead>
                    <tr className="text-gray-400 border-b border-white/10">
                      <th className="text-left py-1.5 pr-3">
                        #
                      </th>
                      <th className="text-left py-1.5 pr-3">
                        Équipe
                      </th>
                      <th className="text-right py-1.5 px-3">
                        Matchs
                      </th>
                      <th className="text-right py-1.5 px-3">
                        V
                      </th>
                      <th className="text-right py-1.5 px-3">
                        D
                      </th>
                      <th className="text-right py-1.5 px-3">
                        Winrate
                      </th>
                      <th className="text-right py-1.5 px-3">
                        Maps (+/-)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedByWinrate.map((t, idx) => (
                      <tr
                        key={t.teamId}
                        className={
                          "border-b border-white/5" +
                          (idx % 2 === 0
                            ? " bg-white/0"
                            : " bg-white/[0.02]")
                        }
                      >
                        <td className="py-1.5 pr-3 text-gray-400">
                          {idx + 1}
                        </td>
                        <td className="py-1.5 pr-3">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden">
                              {t.logoUrl ? (
                                <Image
                                  src={t.logoUrl}
                                  alt={t.teamName}
                                  width={24}
                                  height={24}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-[9px] text-gray-400">
                                  {initials(
                                    t.teamShortName || t.teamName
                                  )}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-gray-100 text-[11px]">
                                {t.teamShortName || t.teamName}
                              </span>
                              {t.teamShortName && (
                                <span className="text-[10px] text-gray-500">
                                  {t.teamName}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-100">
                          {t.matchesPlayed}
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-100">
                          {t.wins}
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-100">
                          {t.losses}
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-100">
                          {(t.winrate * 100).toFixed(0)}%
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-100">
                          {t.mapsWon}-
                          {t.mapsLost}{" "}
                          <span
                            className={
                              "ml-1 " +
                              (t.mapDiff > 0
                                ? "text-emerald-300"
                                : t.mapDiff < 0
                                ? "text-red-300"
                                : "text-gray-300")
                            }
                          >
                            {t.mapDiff > 0
                              ? `(+${t.mapDiff})`
                              : t.mapDiff < 0
                              ? `(${t.mapDiff})`
                              : "(0)"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-2 text-[10px] text-gray-500">
                Les statistiques sont calculées à partir des matchs
                joués sur ce tournoi, en excluant les matchs
                automatiquement gagnés par bye.
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Calcul des stats équipes
 * ────────────────────────────────────────────*/

function computeTeamStats(
  teams: SimpleTeam[],
  matches: MatchRow[],
  games: GameRow[]
): TeamStat[] {
  const matchById = new Map<string, MatchRow>();
  matches.forEach((m) => matchById.set(m.id, m));

  // Pré-agrégation des games par match
  const gameAgg = new Map<
    string,
    { team1Rounds: number; team2Rounds: number }
  >();
  for (const g of games) {
    const mId = g.match_id;
    const entry =
      gameAgg.get(mId) || {
        team1Rounds: 0,
        team2Rounds: 0,
      };
    entry.team1Rounds += g.team1_score ?? 0;
    entry.team2Rounds += g.team2_score ?? 0;
    gameAgg.set(mId, entry);
  }

  const stats: TeamStat[] = teams.map((t) => {
    let matchesPlayed = 0;
    let wins = 0;
    let losses = 0;
    let mapsWon = 0;
    let mapsLost = 0;

    for (const m of matches) {
      const isTeam1 = m.team1_id === t.id;
      const isTeam2 = m.team2_id === t.id;
      if (!isTeam1 && !isTeam2) continue;

      matchesPlayed += 1;

      if (m.winner_team_id) {
        if (m.winner_team_id === t.id) {
          wins += 1;
        } else {
          losses += 1;
        }
      }

      const g = gameAgg.get(m.id);
      if (g) {
        if (isTeam1) {
          mapsWon += g.team1Rounds;
          mapsLost += g.team2Rounds;
        } else if (isTeam2) {
          mapsWon += g.team2Rounds;
          mapsLost += g.team1Rounds;
        }
      }
    }

    const winrate =
      matchesPlayed > 0 ? wins / matchesPlayed : 0;

    return {
      teamId: t.id,
      teamName: t.name,
      teamShortName: t.short_name,
      logoUrl: t.logo_url,
      matchesPlayed,
      wins,
      losses,
      winrate,
      mapsWon,
      mapsLost,
      mapDiff: mapsWon - mapsLost,
    };
  });

  // On garde seulement les équipes ayant joué au moins un match
  return stats.filter((s) => s.matchesPlayed > 0);
}

/* ─────────────────────────────────────────────
 * UI components
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
        {typeof value === "number" ? value.toString() : value}
      </p>
      {hint && (
        <p className="text-[10px] text-gray-400 mt-[2px]">
          {hint}
        </p>
      )}
    </div>
  );
}

function TopTeamCard({
  rank,
  stat,
}: {
  rank: number;
  stat: TeamStat;
}) {
  const rankLabel =
    rank === 1 ? "1er" : rank === 2 ? "2e" : "3e";

  const chipClass =
    rank === 1
      ? "bg-yellow-500/20 border-yellow-400/60 text-yellow-100"
      : rank === 2
      ? "bg-gray-300/15 border-gray-200/60 text-gray-100"
      : "bg-amber-800/30 border-amber-500/60 text-amber-100";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span
          className={
            "inline-flex items-center justify-center text-[10px] px-2 py-[2px] rounded-full border " +
            chipClass
          }
        >
          {rankLabel} équipe
        </span>
        <span className="text-[10px] text-gray-400">
          {(stat.winrate * 100).toFixed(0)}% de victoire
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden">
          {stat.logoUrl ? (
            <Image
              src={stat.logoUrl}
              alt={stat.teamName}
              width={28}
              height={28}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-[9px] text-gray-400">
              {initials(stat.teamShortName || stat.teamName)}
            </span>
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-white">
            {stat.teamShortName || stat.teamName}
          </span>
          {stat.teamShortName && (
            <span className="text-[10px] text-gray-400">
              {stat.teamName}
            </span>
          )}
        </div>
      </div>

      <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-gray-300">
        <span>
          Matchs :{" "}
          <span className="text-gray-100">
            {stat.matchesPlayed}
          </span>
        </span>
        <span>
          V/D :{" "}
          <span className="text-emerald-300">
            {stat.wins}
          </span>
          /
          <span className="text-red-300">
            {stat.losses}
          </span>
        </span>
        <span>
          Maps :{" "}
          <span className="text-gray-100">
            {stat.mapsWon}-{stat.mapsLost}
          </span>{" "}
          <span
            className={
              stat.mapDiff > 0
                ? "text-emerald-300"
                : stat.mapDiff < 0
                ? "text-red-300"
                : "text-gray-300"
            }
          >
            {stat.mapDiff > 0
              ? `(+${stat.mapDiff})`
              : stat.mapDiff < 0
              ? `(${stat.mapDiff})`
              : "(0)"}
          </span>
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Shared utils (comme sur les autres pages)
 * ────────────────────────────────────────────*/

function formatTournamentDates(
  start?: string | null,
  end?: string | null
): string | null {
  if (!start && !end) return null;

  const opts: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
  };

  if (start && end) {
    const s = new Date(start);
    const e = new Date(end);
    if (s.getTime() === e.getTime()) {
      return `Le ${s.toLocaleDateString("fr-FR", opts)}`;
    }
    return `Du ${s.toLocaleDateString(
      "fr-FR",
      opts
    )} au ${e.toLocaleDateString("fr-FR", opts)}`;
  }

  if (start) {
    const s = new Date(start);
    return `À partir du ${s.toLocaleDateString("fr-FR", opts)}`;
  }

  const e = new Date(end!);
  return `Jusqu'au ${e.toLocaleDateString("fr-FR", opts)}`;
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "upcoming":
      return "À venir";
    case "running":
    case "ongoing":
      return "En cours";
    case "finished":
    case "completed":
      return "Terminé";
    default:
      return status;
  }
}

function getStatusChipColor(status: string): string {
  switch (status) {
    case "upcoming":
      return "px-1.5 py-[2px] rounded-full bg-yellow-500/20 text-yellow-200 border border-yellow-500/60";
    case "running":
    case "ongoing":
      return "px-1.5 py-[2px] rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-500/60";
    case "finished":
    case "completed":
      return "px-1.5 py-[2px] rounded-full bg-gray-500/20 text-gray-200 border border-gray-500/60";
    default:
      return "px-1.5 py-[2px] rounded-full bg-white/10 text-white border border-white/30";
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
