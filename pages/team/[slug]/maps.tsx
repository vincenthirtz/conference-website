// @ts-nocheck
/* eslint-disable @next/next/no-img-element */
import type { GetServerSideProps, NextPage } from "next";
import Head from "next/head";
import Link from "next/link";
import Heading from "@/components/Typography/heading";
import Paragraph from "@/components/Typography/paragraph";
import { supabaseAdmin } from "@/utils/supabase"; // adapte le chemin si besoin

type Team = {
  id: string;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
  country?: string | null;
  description?: string | null;
};

type TeamMapStat = {
  map_name: string;
  games_played: number;
  wins: number;
  losses: number;
  rounds_won?: number | null;
  rounds_lost?: number | null;
  win_rate?: number | null; // en %
};

type Props = {
  team: Team | null;
  mapStats: TeamMapStat[];
};

const TeamMapsPage: NextPage<Props> = ({ team, mapStats }) => {
  if (!team) {
    return (
      <>
        <Head>
          <title>Équipe introuvable – OW Women&apos;s Cup</title>
        </Head>
        <main className="min-h-screen bg-neutral-900 text-white">
          <div className="container mx-auto px-4 py-16">
            <Heading level={1} className="text-center mb-4">
              Équipe introuvable
            </Heading>
            <Paragraph className="text-center text-neutral-400 mb-8">
              Impossible de trouver cette équipe.
            </Paragraph>
            <div className="flex justify-center">
              <Link href="/" className="text-blue-400 hover:underline">
                ← Retour à l&apos;accueil
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  const hasStats = mapStats && mapStats.length > 0;

  return (
    <>
      <Head>
        <title>
          Stats maps – {team.name} | OW Women&apos;s Cup
        </title>
        <meta
          name="description"
          content={`Statistiques par carte de l'équipe ${team.name} – OW Women's Cup`}
        />
      </Head>

      <main className="min-h-screen bg-neutral-900 text-white">
        <div className="container mx-auto px-4 py-16">
          {/* Breadcrumb / retour */}
          <div className="mb-6">
            <Link
              href={`/team/${team.id}`}
              className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
            >
              <span>←</span>
              <span>Retour à la fiche équipe</span>
            </Link>
          </div>

          {/* Header équipe */}
          <section className="flex flex-col md:flex-row items-start md:items-center gap-6 mb-10">
            <div className="flex items-center gap-4">
              {team.logo_url && (
                <div className="w-20 h-20 rounded-2xl overflow-hidden bg-neutral-800 flex items-center justify-center border border-neutral-700">
                  <img
                    src={team.logo_url}
                    alt={team.name}
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
              <div>
                <Heading level={1} className="text-3xl md:text-4xl mb-1">
                  {team.name}
                  {team.short_name && (
                    <span className="ml-2 text-sm px-2 py-1 rounded-full bg-white/10 border border-white/20 uppercase tracking-wide align-middle">
                      {team.short_name}
                    </span>
                  )}
                </Heading>
                <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-400">
                  {team.country && (
                    <span className="px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700">
                      {team.country}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-full bg-blue-900/40 border border-blue-700/60 text-blue-200">
                    Stats par carte
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Description rapide */}
          {team.description && (
            <section className="mb-10">
              <Paragraph className="text-neutral-300 max-w-3xl">
                {team.description}
              </Paragraph>
            </section>
          )}

          {/* Stats maps */}
          <section className="bg-neutral-800/80 border border-neutral-700 rounded-2xl p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb  -4">
              <div>
                <Heading level={2} className="text-2xl">
                  Performance par carte
                </Heading>
                <Paragraph className="text-neutral-400 mt-1">
                  Nombre de matchs, victoires, défaites et winrate par carte
                  jouée.
                </Paragraph>
              </div>
            </div>

            {!hasStats && (
              <div className="mt-8 text-neutral-400 text-sm">
                Aucune statistique de cartes disponible pour cette équipe pour
                le moment.
              </div>
            )}

            {hasStats && (
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-neutral-900/80">
                      <th className="text-left px-3 py-2 border-b border-neutral-700 font-medium">
                        Carte
                      </th>
                      <th className="text-center px-3 py-2 border-b border-neutral-700 font-medium">
                        Joués
                      </th>
                      <th className="text-center px-3 py-2 border-b border-neutral-700 font-medium">
                        V
                      </th>
                      <th className="text-center px-3 py-2 border-b border-neutral-700 font-medium">
                        D
                      </th>
                      <th className="text-center px-3 py-2 border-b border-neutral-700 font-medium">
                        WR
                      </th>
                      <th className="text-center px-3 py-2 border-b border-neutral-700 font-medium">
                        Rounds
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapStats.map((m) => {
                      const wr =
                        typeof m.win_rate === "number"
                          ? m.win_rate
                          : m.games_played > 0
                          ? (m.wins / m.games_played) * 100
                          : 0;

                      const roundedWr = Math.round(wr * 10) / 10;
                      const roundsInfo =
                        m.rounds_won != null && m.rounds_lost != null
                          ? `${m.rounds_won}-${m.rounds_lost}`
                          : "—";

                      return (
                        <tr
                          key={m.map_name}
                          className="border-b border-neutral-800 hover:bg-neutral-900/70 transition-colors"
                        >
                          <td className="px-3 py-2 font-medium">
                            {m.map_name}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {m.games_played}
                          </td>
                          <td className="px-3 py-2 text-center text-emerald-300">
                            {m.wins}
                          </td>
                          <td className="px-3 py-2 text-center text-red-300">
                            {m.losses}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span>{roundedWr.toFixed(1)}%</span>
                              <div className="w-20 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                                <div
                                  className="h-1.5 bg-emerald-500"
                                  style={{ width: `${Math.min(100, wr)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {roundsInfo}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const slug = ctx.params?.slug as string | undefined;
  if (!slug) {
    return { notFound: true };
  }

  // Même logique que ta page fusionnée [id]/[name] : si UUID → on cherche par id, sinon par name
  const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
    slug
  );
  const column = isUuid ? "id" : "name";

  // 1) Récupérer l'équipe
  const { data: team, error: teamError } = await supabaseAdmin
    .from("teams")
    .select<"*, id, name, short_name, logo_url, country, description">()
    .eq(column, slug)
    .maybeSingle();

  if (teamError || !team) {
    console.error("Erreur chargement équipe (maps):", teamError);
    return { notFound: true };
  }

  // 2) Récupérer les stats de maps
  const { data: mapStats, error: mapsError } = await supabaseAdmin
    .from("team_map_stats")
    .select(
      "map_name, games_played, wins, losses, rounds_won, rounds_lost, win_rate"
    )
    .eq("team_id", team.id)
    .order("games_played", { ascending: false });

  if (mapsError) {
    console.error("Erreur chargement team_map_stats:", mapsError);
  }

  return {
    props: {
      team,
      mapStats: mapStats ?? [],
    },
  };
};

export default TeamMapsPage;
