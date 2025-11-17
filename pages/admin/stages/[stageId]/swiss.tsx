// pages/admin/stages/[stageId]/swiss.tsx

import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { withStaffPage } from "@/utils/staff";
import { StaffRoleBadge } from "@/components/admin/StaffRoleBadge";

type StaffProps = {
  staff: {
    id: string | null;
    role: string;
    display_name: string | null;
  };
};

type MatchStatus = "pending" | "ongoing" | "finished" | "cancelled";

type StageType =
  | "group"
  | "bracket"
  | "swiss"
  | "round_robin"
  | "showmatch"
  | "other";

type TeamMini = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

type SwissStanding = {
  team_id: string;
  team: TeamMini | null;
  rank: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  games_won: number;
  games_lost: number;
  games_drawn: number;
  buchholz: number | null;
  opp_score_sum: number | null;
  opp_winrate: number | null;
  match_count: number;
};

type SwissRoundMatch = {
  id: string;
  round_number: number;
  tournament_id: string;
  stage_id: string | null;
  status: MatchStatus;
  best_of: number | null;
  scheduled_at: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1: TeamMini | null;
  team2: TeamMini | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
};

type SwissRound = {
  round_number: number;
  matches: SwissRoundMatch[];
};

type StageMini = {
  id: string;
  name: string;
  stage_type: StageType | null;
};

type TournamentMini = {
  id: string;
  name: string;
  slug: string | null;
};

type SwissApiResponse = {
  stage: StageMini;
  tournament: TournamentMini | null;
  standings: SwissStanding[];
  rounds: SwissRound[];
};

export const getServerSideProps = withStaffPage("manager");

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusLabel(status: MatchStatus) {
  switch (status) {
    case "pending":
      return "À venir";
    case "ongoing":
      return "En cours";
    case "finished":
      return "Terminé";
    case "cancelled":
      return "Annulé";
    default:
      return status;
  }
}

function statusColor(status: MatchStatus) {
  switch (status) {
    case "pending":
      return "bg-neutral-700 text-neutral-100";
    case "ongoing":
      return "bg-amber-600/80 text-neutral-900";
    case "finished":
      return "bg-emerald-600/80 text-white";
    case "cancelled":
      return "bg-red-700/80 text-white";
    default:
      return "bg-neutral-700 text-neutral-100";
  }
}

function AdminSwissStagePage({ staff }: StaffProps) {
  const router = useRouter();
  const { stageId } = router.query;

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const [stage, setStage] = useState<StageMini | null>(null);
  const [tournament, setTournament] = useState<TournamentMini | null>(null);
  const [standings, setStandings] = useState<SwissStanding[]>([]);
  const [rounds, setRounds] = useState<SwissRound[]>([]);

  const [loadingGenerate, setLoadingGenerate] = useState(false);

  useEffect(() => {
    if (!stageId) return;
    fetchSwissData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageId]);

  async function fetchSwissData() {
    if (!stageId) return;
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      // Endpoint Swiss global (standings + rounds)
      // Adapte si tu as choisi un autre nom : /swiss, /standings, etc.
      const res = await fetch(`/api/admin/stages/${stageId}/swiss`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Impossible de charger les données Swiss");
      }

      const json: SwissApiResponse = await res.json();
      setStage(json.stage);
      setTournament(json.tournament ?? null);
      setStandings(json.standings || []);
      setRounds(json.rounds || []);
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }

  function currentRoundNumber() {
    if (!rounds.length) return 0;
    return Math.max(...rounds.map((r) => r.round_number));
  }

  async function handleGenerateNextRound() {
    if (!stageId) return;
    setLoadingGenerate(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      const res = await fetch(
        `/api/admin/stages/${stageId}/generate-swiss-round`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // body vide = "next round auto" côté backend
          body: JSON.stringify({}),
        }
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          json.error || "Erreur lors de la génération de la ronde Swiss"
        );
      }

      const json = await res.json();
      const roundNumber = json.roundNumber ?? "?";
      const createdCount = json.createdMatches?.length ?? 0;

      setInfoMsg(
        `Ronde Swiss #${roundNumber} générée : ${createdCount} matchs créés.`
      );
      fetchSwissData();
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Erreur lors de la génération de la ronde");
    } finally {
      setLoadingGenerate(false);
    }
  }

  const backStageUrl = `/admin/stages/${stageId}`;
  const backTournamentUrl =
    tournament?.id ? `/admin/tournament/${tournament.id}` : "/admin/tournaments";

  return (
    <>
      <Head>
        <title>Admin – Swiss stage</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <button
              type="button"
              onClick={() => router.push(backStageUrl)}
              className="mb-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
            >
              ← Retour à la phase
            </button>
            <h1 className="text-3xl font-bold">Gestion Swiss</h1>

            {stage && (
              <p className="text-neutral-400 text-sm mt-1">
                Phase :{" "}
                <span className="font-semibold">{stage.name}</span>
                {stage.stage_type && (
                  <span className="ml-2 text-[10px] uppercase tracking-wide bg-neutral-800 border border-neutral-700 px-1.5 py-0.5 rounded">
                    {stage.stage_type}
                  </span>
                )}
                {tournament && (
                  <>
                    {" "}
                    • Tournoi{" "}
                    <Link
                      href={backTournamentUrl}
                      className="font-semibold hover:underline"
                    >
                      {tournament.name}
                    </Link>
                  </>
                )}
              </p>
            )}
            {!!rounds.length && (
              <p className="text-xs text-neutral-500 mt-1">
                Ronde actuelle : {currentRoundNumber()}
              </p>
            )}
          </div>
          <StaffRoleBadge staff={staff} />
        </div>

        {/* Messages */}
        {errorMsg && (
          <div className="mb-4 rounded bg-red-900/60 border border-red-600 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}
        {infoMsg && (
          <div className="mb-4 rounded bg-emerald-900/60 border border-emerald-600 px-4 py-3 text-sm">
            {infoMsg}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 items-center mb-6">
          <button
            type="button"
            onClick={fetchSwissData}
            disabled={loading || loadingGenerate}
            className={`px-4 py-2 rounded text-sm border border-neutral-600 ${
              loading
                ? "bg-neutral-800 cursor-wait"
                : "bg-neutral-800 hover:bg-neutral-700"
            }`}
          >
            Rafraîchir les données
          </button>

          <button
            type="button"
            onClick={handleGenerateNextRound}
            disabled={loadingGenerate}
            className={`px-4 py-2 rounded text-sm font-semibold ${
              loadingGenerate
                ? "bg-blue-800 cursor-wait"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {loadingGenerate
              ? "Génération en cours…"
              : "Générer la prochaine ronde Swiss"}
          </button>

          <p className="text-xs text-neutral-500">
            La génération utilise le système de pairing Swiss (victoires, Buchholz,
            etc.) et évite les rematches autant que possible.
          </p>
        </div>

        {loading && (
          <div className="text-neutral-300">Chargement des données Swiss…</div>
        )}

        {!loading && !stage && !errorMsg && (
          <div className="text-neutral-300">Phase introuvable.</div>
        )}

        {!loading && stage && (
          <div className="grid gap-6 pt-20 lg:grid-cols-[1.5fr,2fr] xl:grid-cols-[1.3fr,2fr]">
            {/* Standings */}
            <section className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-700 flex justify-between items-center">
                <h2 className="text-sm font-semibold">
                  Classement Swiss (standings)
                </h2>
                <span className="text-xs text-neutral-400">
                  {standings.length} équipe
                  {standings.length > 1 ? "s" : ""}
                </span>
              </div>

              {standings.length === 0 ? (
                <div className="px-4 py-6 text-sm text-neutral-400">
                  Aucun classement disponible. Assure-toi que des équipes sont
                  rattachées à la phase et que des rondes ont été jouées.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-neutral-750 text-neutral-300">
                      <tr>
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-left">Équipe</th>
                        <th className="px-3 py-2 text-center">V</th>
                        <th className="px-3 py-2 text-center">D</th>
                        <th className="px-3 py-2 text-center">N</th>
                        <th className="px-3 py-2 text-center">Pts</th>
                        <th className="px-3 py-2 text-center">Maps +/−</th>
                        <th className="px-3 py-2 text-center">Buchholz</th>
                        <th className="px-3 py-2 text-center">Winrate adv.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((s) => {
                        const display = s.team?.name || s.team_id;
                        const diff =
                          (s.games_won ?? 0) - (s.games_lost ?? 0);
                        const wr =
                          s.opp_winrate != null
                            ? `${(s.opp_winrate * 100).toFixed(1)}%`
                            : "—";

                        return (
                          <tr
                            key={s.team_id}
                            className="border-t border-neutral-700"
                          >
                            <td className="px-3 py-2 text-center font-semibold">
                              {s.rank}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                {s.team?.logo_url && (
                                  <img
                                    src={s.team.logo_url}
                                    alt={display}
                                    className="w-6 h-6 rounded object-cover border border-neutral-700"
                                  />
                                )}
                                <div>
                                  <div className="font-semibold text-neutral-50">
                                    {display}
                                  </div>
                                  {s.team?.short_name && (
                                    <div className="text-[10px] text-neutral-400">
                                      {s.team.short_name}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-center">
                              {s.wins}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {s.losses}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {s.draws}
                            </td>
                            <td className="px-3 py-2 text-center font-semibold">
                              {s.points}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {s.games_won} / {s.games_lost}{" "}
                              <span
                                className={
                                  diff > 0
                                    ? "text-emerald-300"
                                    : diff < 0
                                    ? "text-red-300"
                                    : "text-neutral-300"
                                }
                              >
                                ({diff > 0 ? "+" : ""}
                                {diff})
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              {s.buchholz != null
                                ? s.buchholz.toFixed(1)
                                : "—"}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {wr}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Rounds & matches */}
            <section className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-700 flex justify-between items-center">
                <h2 className="text-sm font-semibold">
                  Rondes Swiss & matches
                </h2>
                <span className="text-xs text-neutral-400">
                  {rounds.length} ronde
                  {rounds.length > 1 ? "s" : ""}
                </span>
              </div>

              {rounds.length === 0 ? (
                <div className="px-4 py-6 text-sm text-neutral-400">
                  Aucune ronde n&apos;est encore générée. Utilise le bouton
                  &quot;Générer la prochaine ronde Swiss&quot; pour créer la
                  ronde #1.
                </div>
              ) : (
                <div className="max-h-[70vh] overflow-y-auto">
                  {rounds
                    .slice()
                    .sort(
                      (a, b) => a.round_number - b.round_number
                    )
                    .map((round) => (
                      <SwissRoundBlock key={round.round_number} round={round} />
                    ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </>
  );
}

type RoundBlockProps = {
  round: SwissRound;
};

function SwissRoundBlock({ round }: RoundBlockProps) {
  return (
    <div className="border-b border-neutral-700 last:border-b-0">
      <div className="px-4 py-2 bg-neutral-825 flex justify-between items-center">
        <div className="text-sm font-semibold">
          Ronde Swiss #{round.round_number}
        </div>
        <div className="text-xs text-neutral-400">
          {round.matches.length} match
          {round.matches.length > 1 ? "es" : ""}
        </div>
      </div>
      <div className="divide-y divide-neutral-800">
        {round.matches.map((m) => (
          <SwissMatchRow key={m.id} match={m} />
        ))}
      </div>
    </div>
  );
}

type SwissMatchRowProps = {
  match: SwissRoundMatch;
};

function SwissMatchRow({ match }: SwissMatchRowProps) {
  const label1 = match.team1?.name || match.team1_id || "TBD";
  const label2 = match.team2?.name || match.team2_id || "TBD";

  const scoreStr =
    match.status === "finished" || match.status === "ongoing"
      ? `${match.team1_score ?? 0} - ${match.team2_score ?? 0}`
      : "—";

  const isBo = match.best_of ? `BO${match.best_of}` : "";

  return (
    <div className="px-4 py-2 text-xs flex flex-col md:flex-row md:items-center md:justify-between gap-2">
      <div className="flex items-center gap-3">
        <div className="hidden md:block text-[11px] text-neutral-500 font-mono">
          #{match.id.slice(0, 6)}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            {match.team1?.logo_url && (
              <img
                src={match.team1.logo_url}
                alt={label1}
                className="w-5 h-5 rounded object-cover border border-neutral-700"
              />
            )}
            <span className="font-semibold text-neutral-50">{label1}</span>
            <span className="text-neutral-400">vs</span>
            {match.team2?.logo_url && (
              <img
                src={match.team2.logo_url}
                alt={label2}
                className="w-5 h-5 rounded object-cover border border-neutral-700"
              />
            )}
            <span className="font-semibold text-neutral-50">{label2}</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-neutral-500">
            <span>
              {isBo && (
                <>
                  {isBo} •{" "}
                </>
              )}
              Score : <span className="text-neutral-200">{scoreStr}</span>
            </span>
            <span>|</span>
            <span>{formatDateTime(match.scheduled_at)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 md:justify-end">
        <span
          className={`px-2 py-1 rounded-full text-[10px] font-semibold ${statusColor(
            match.status
          )}`}
        >
          {statusLabel(match.status)}
        </span>
        <Link
          href={`/admin/matches/${match.id}`}
          className="px-2 py-1 rounded bg-neutral-750 hover:bg-neutral-700 text-[11px]"
        >
          Ouvrir (admin)
        </Link>
        <Link
          href={`/match/${match.id}`}
          target="_blank"
          className="px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-[11px]"
        >
          Public
        </Link>
      </div>
    </div>
  );
}

export default AdminSwissStagePage;
