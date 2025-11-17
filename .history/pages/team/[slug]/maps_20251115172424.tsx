// pages/team/[slug]/maps.tsx
/* eslint-disable react/no-unescaped-entities */
import { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import Heading from "@/components/Typography/heading";
import Paragraph from "@/components/Typography/paragraph";
import Button from "@/components/Buttons/button";
import { supabaseAdmin } from "@/utils/supabase";

type Team = {
  id: string;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
  country?: string | null;
  description?: string | null;
  created_at: string;
};

type MatchStatus = "pending" | "ongoing" | "finished" | "cancelled";

type MatchRow = {
  id: string;
  status: MatchStatus;
  is_bye: boolean | null;
  team1_id: string | null;
  team2_id: string | null;
};

type GameRow = {
  match_id: string;
  map_name: string | null;
  team1_score: number | null;
  team2_score: number | null;
  is_tiebreaker: boolean | null;
  went_overtime: boolean | null;
};

type MapStat = {
  mapName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winrate: number; // 0–1
  roundsFor: number;
  roundsAgainst: number;
  diff: number;
  overtimes: number;
  tiebreakers: number;
};

type Props = {
  team: Team;
  mapStats: MapStat[];
  totalMatches: number;
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const slug = ctx.params?.slug;

  if (!slug || Array.isArray(slug)) {
    return { notFound: true };
  }

  // Ici on décide que le slug de cette page = team.id
  const teamId = slug as string;

  // 1) Team
  const { data: team, error: tErr } = await supabaseAdmin
    .from("teams")
    .select("*")
    .eq("id", teamId)
    .single();

  if (tErr || !team) {
    return { notFound: true };
  }

  // 2) Matches où l'équipe apparaît (tous tournois, hors cancelled)
  const { data: matchesData, error: mErr } = await supabaseAdmin
    .from("matches")
    .select("id, status, is_bye, team1_id, team2_id")
    .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
    .neq("status", "cancelled");

  if (mErr) {
    console.error("team maps matches error:", mErr);
  }

  const matches = ((matchesData || []) as MatchRow[]).filter(
    (m) => !m.is_bye
  );
  const matchIds = matches.map((m) => m.id);

  // 3) Games de ces matches
  let games: GameRow[] = [];
  if (matchIds.length > 0) {
    const { data: gamesData, error: gErr } = await supabaseAdmin
      .from("games")
      .select(
        "match_id, map_name, team1_score, team2_score, is_tiebreaker, went_overtime"
      )
      .in("match_id", matchIds);

    if (gErr) {
      console.error("team maps games error:", gErr);
    } else {
      games = (gamesData || []) as GameRow[];
    }
  }

  const mapStats = computeMapStatsForTeam(teamId, matches, games);
  const totalMatches = matches.length;

  return {
    props: {
      team: team as Team,
      mapStats,
      totalMatches,
    },
  };
};

export default function TeamMapsPage({
  team,
  mapStats,
  totalMatches,
}: Props) {
  const name = team.name;
  const shortName = team.short_name || null;
  const logo = team.logo_url || null;

  const title = shortName ? `${shortName} – maps` : `${name} – maps`;

  const mapsDistinctes = mapStats.length;
  const totalGames = mapStats.reduce(
    (acc, m) => acc + m.gamesPlayed,
    0
  );

  const bestMap =
    mapStats.length > 0
      ? [...mapStats].sort(
          (a, b) =>
            b.winrate - a.winrate || b.gamesPlayed - a.gamesPlayed
        )[0]
      : null;

  const mostPlayed =
    mapStats.length > 0 ? mapStats[0] : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <Head>
        <title>{title} | OW Women&apos;s Cup</title>
      </Head>

      <main className="container mx-auto px-4 pt-24 pb-16 max-w-5xl">
        {/* HERO */}
        <section className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-black/60 border border-white/15 flex items-center justify-center overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logo ? (
                  <img
                    src={logo}
                    alt={name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-base font-semibold text-gray-300">
                    {initials(shortName || name)}
                  </span>
                )}
              </div>
              <div>
                <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-wide mb-1">
                  <span className="px-1.5 py-[2px] rounded-full bg-gradient-to-r from-purple-400/90 to-pink-400/90 text-black font-semibold">
                    Profil de maps
                  </span>
                </div>

                <Heading
                  typeStyle="heading-md"
                  className="text-gradient mb-0.5"
                >
                  {shortName || name}
                </Heading>
                {shortName && (
                  <p className="text-[11px] text-gray-400">
                    {name}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <Link href={`/team/${team.id}`}>
                <Button
                  type="button"
                  className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-blue-400"
                >
                  ← Fiche équipe
                </Button>
              </Link>
              <Link href={`/team/${team.id}/stats`}>
                <Button
                  type="button"
                  className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-emerald-400"
                >
                  Stats globales
                </Button>
              </Link>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Matchs joués" value={totalMatches} />
            <StatCard label="Games maps" value={totalGames} />
            <StatCard label="Maps distinctes" value={mapsDistinctes} />
            <StatCard
              label="Data disponible"
              value={
                totalGames > 0
                  ? "OK"
                  : "En attente de résultats"
              }
            />
          </div>
        </section>

        {/* SUMMARY MAPS */}
        <section className="mb-8">
          <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
            {mapStats.length === 0 && (
              <Paragraph
                typeStyle="body-sm"
                textColor="text-gray-300"
              >
                Pas encore assez de données sur les maps de cette
                équipe. Dès que des résultats seront enregistrés,
                son profil de maps apparaîtra ici.
              </Paragraph>
            )}

            {mapStats.length > 0 && (
              <>
                <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">
                  Résumé du profil de maps
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                  <StatCard
                    label="Map préférée"
                    value={bestMap ? bestMap.mapName : "—"}
                    hint={
                      bestMap
                        ? `${bestMap.gamesPlayed} games · ${(bestMap.winrate * 100).toFixed(0)}% WR`
                        : undefined
                    }
                  />
                  <StatCard
                    label="Map la plus jouée"
                    value={mostPlayed ? mostPlayed.mapName : "—"}
                    hint={
                      mostPlayed
                        ? `${mostPlayed.gamesPlayed} games`
                        : undefined
                    }
                  />
                  <StatCard
                    label="Overtimes"
                    value={mapStats.reduce(
                      (acc, m) => acc + m.overtimes,
                      0
                    )}
                  />
                  <StatCard
                    label="Tiebreakers"
                    value={mapStats.reduce(
                      (acc, m) => acc + m.tiebreakers,
                      0
                    )}
                  />
                </div>
                <Paragraph
                  typeStyle="body-xs"
                  textColor="text-gray-400"
                >
                  Ces stats sont basées sur l&apos;ensemble des
                  matchs joués par l&apos;équipe (tous tournois confondus),
                  en excluant les matchs gagnés par bye.
                </Paragraph>
              </>
            )}
          </div>
        </section>

        {/* TABLEAU DES MAPS */}
        {mapStats.length > 0 && (
          <section>
            <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-3">
                Stats détaillées par map
              </p>

              <div className="overflow-x-auto">
                <table className="min-w-full text-[11px]">
                  <thead>
                    <tr className="text-gray-400 border-b border-white/10">
                      <th className="text-left py-1.5 pr-3">
                        Map
                      </th>
                      <th className="text-right py-1.5 px-3">
                        Games
                      </th>
                      <th className="text-right py-1.5 px-3">
                        W
                      </th>
                      <th className="text-right py-1.5 px-3">
                        L
                      </th>
                      <th className="text-right py-1.5 px-3">
                        Winrate
                      </th>
                      <th className="text-right py-1.5 px-3">
                        Rounds (+/-)
                      </th>
                      <th className="text-right py-1.5 px-3">
                        OTs
                      </th>
                      <th className="text-right py-1.5 pl-3">
                        Tiebreakers
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapStats.map((m, idx) => (
                      <tr
                        key={m.mapName}
                        className={
                          "border-b border-white/5" +
                          (idx % 2 === 0
                            ? " bg-white/0"
                            : " bg-white/[0.02]")
                        }
                      >
                        <td className="py-1.5 pr-3 text-gray-100">
                          {m.mapName}
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-100">
                          {m.gamesPlayed}
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-100">
                          {m.wins}
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-100">
                          {m.losses}
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-100">
                          {(m.winrate * 100).toFixed(0)}%
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-100">
                          {m.roundsFor}-{m.roundsAgainst}{" "}
                          <span
                            className={
                              "ml-1 " +
                              (m.diff > 0
                                ? "text-emerald-300"
                                : m.diff < 0
                                ? "text-red-300"
                                : "text-gray-300")
                            }
                          >
                            {m.diff > 0
                              ? `(+${m.diff})`
                              : m.diff < 0
                              ? `(${m.diff})`
                              : "(0)"}
                          </span>
                        </td>
                        <td className="py-1.5 px-3 text-right text-gray-100">
                          {m.overtimes}
                        </td>
                        <td className="py-1.5 pl-3 text-right text-gray-100">
                          {m.tiebreakers}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-2 text-[10px] text-gray-500">
                Les overtimes et tiebreakers sont déduits des flags
                `went_overtime` et `is_tiebreaker` sur chaque game.
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Calcul des stats de maps pour une équipe
 * ────────────────────────────────────────────*/

function computeMapStatsForTeam(
  teamId: string,
  matches: MatchRow[],
  games: GameRow[]
): MapStat[] {
  const matchById = new Map<string, MatchRow>();
  matches.forEach((m) => matchById.set(m.id, m));

  type Agg = {
    games: number;
    wins: number;
    losses: number;
    roundsFor: number;
    roundsAgainst: number;
    overtimes: number;
    tiebreakers: number;
  };

  const agg = new Map<string, Agg>();

  for (const g of games) {
    if (!g.map_name) continue;
    const match = matchById.get(g.match_id);
    if (!match) continue;

    const isTeam1 = match.team1_id === teamId;
    const isTeam2 = match.team2_id === teamId;
    if (!isTeam1 && !isTeam2) continue;

    const key = g.map_name;
    const entry =
      agg.get(key) || {
        games: 0,
        wins: 0,
        losses: 0,
        roundsFor: 0,
        roundsAgainst: 0,
        overtimes: 0,
        tiebreakers: 0,
      };

    entry.games += 1;

    const s1 = g.team1_score ?? 0;
    const s2 = g.team2_score ?? 0;

    if (isTeam1) {
      entry.roundsFor += s1;
      entry.roundsAgainst += s2;
      if (s1 > s2) entry.wins += 1;
      else if (s1 < s2) entry.losses += 1;
    } else if (isTeam2) {
      entry.roundsFor += s2;
      entry.roundsAgainst += s1;
      if (s2 > s1) entry.wins += 1;
      else if (s2 < s1) entry.losses += 1;
    }

    if (g.went_overtime) entry.overtimes += 1;
    if (g.is_tiebreaker) entry.tiebreakers += 1;

    agg.set(key, entry);
  }

  const list: MapStat[] = Array.from(a
