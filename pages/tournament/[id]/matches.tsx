// @ts-nocheck
// pages/tournament/[id]/matches.tsx
/* eslint-disable react/no-unescaped-entities */
import { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
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
};

type Stage = {
  id: string;
  tournament_id: string;
  name: string;
  stage_type: string;
};

type SimpleTeam = {
  id: string;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
};

type MatchStatus = "pending" | "ongoing" | "finished" | "cancelled";

type SimpleMatch = {
  id: string;
  scheduled_at: string | null;
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

type Props = {
  tournament: Tournament;
  stages: Stage[];
  matches: SimpleMatch[];
  statusFilter: string;
  stageFilter: string;
};

export const getServerSideProps: GetServerSideProps<Props> = async (
  ctx
) => {
  const { id, status, stageId } = ctx.query;

  if (!id || Array.isArray(id)) {
    return { notFound: true };
  }

  const statusFilter =
    typeof status === "string" ? status : "all";
  const stageFilter =
    typeof stageId === "string" ? stageId : "all";

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

  // 2) Stages
  const { data: stages, error: sErr } = await supabaseAdmin
    .from("tournament_stages")
    .select("*")
    .eq("tournament_id", id)
    .order("created_at", { ascending: true });

  if (sErr) {
    console.error("matches page stages error:", sErr);
  }

  // 3) Matches avec filtres
  let q = supabaseAdmin
    .from("matches")
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
    .eq("tournament_id", id)
    .neq("status", "cancelled");

  if (
    statusFilter === "pending" ||
    statusFilter === "ongoing" ||
    statusFilter === "finished"
  ) {
    q = q.eq("status", statusFilter);
  }

  if (stageFilter !== "all") {
    q = q.eq("stage_id", stageFilter);
  }

  const { data: matchesData, error: mErr } = await q
    .order("scheduled_at", { ascending: true })
    .order("created_at", { ascending: true });

  if (mErr) {
    console.error("matches page matches error:", mErr);
  }

  const matches = (matchesData || []) as any as SimpleMatch[];

  return {
    props: {
      tournament: tournament as Tournament,
      stages: (stages || []) as Stage[],
      matches,
      statusFilter,
      stageFilter,
    },
  };
};

export default function TournamentMatchesPage({
  tournament,
  stages,
  matches,
  statusFilter,
  stageFilter,
}: Props) {
  const dateRangeLabel = formatTournamentDates(
    tournament.start_date,
    tournament.end_date
  );
  const statusLabel = getStatusLabel(tournament.status);
  const statusColor = getStatusChipColor(tournament.status);

  const grouped = groupMatchesByDay(matches);

  const hasFilters =
    statusFilter !== "all" || stageFilter !== "all";

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <Head>
        <title>
          Matchs – {tournament.name} | OW Women&apos;s Cup
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
                Matchs – {tournament.name}
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
                Retrouvez ici la liste complète des matchs du
                tournoi. Utilisez les filtres pour naviguer par
                phase ou par statut (à venir, en cours, terminés).
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
              <Link href={`/tournament/${tournament.id}/bracket`}>
                <Button
                  type="button"
                  className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-purple-400"
                >
                  Voir le bracket
                </Button>
              </Link>
              <Link href={`/tournament/${tournament.id}/maps`}>
                <Button
                  type="button"
                  className="text-xs px-4 py-2 bg-transparent border border-white/40 hover:border-emerald-400"
                >
                  Top maps
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Filters */}
        <section className="mb-4">
          <div className="bg-black/60 border border-white/5 rounded-2xl p-3">
            <form
              method="get"
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px]"
            >
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-gray-400 uppercase tracking-wide">
                  Filtres
                </span>

                {/* Status filter */}
                <label className="flex items-center gap-1">
                  <span className="text-gray-400">
                    Statut :
                  </span>
                  <select
                    name="status"
                    defaultValue={statusFilter}
                    className="bg-black border border-white/15 rounded-lg px-2 py-1 text-[11px] text-gray-100"
                  >
                    <option value="all">Tous</option>
                    <option value="pending">À venir</option>
                    <option value="ongoing">En cours</option>
                    <option value="finished">Terminés</option>
                  </select>
                </label>

                {/* Stage filter */}
                <label className="flex items-center gap-1">
                  <span className="text-gray-400">
                    Phase :
                  </span>
                  <select
                    name="stageId"
                    defaultValue={stageFilter}
                    className="bg-black border border-white/15 rounded-lg px-2 py-1 text-[11px] text-gray-100 max-w-[180px]"
                  >
                    <option value="all">Toutes</option>
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap gap-2 justify-end">
                <Button
                  type="submit"
                  className="text-xs px-3 py-1.5 bg-white text-black hover:bg-gray-100 rounded-full"
                >
                  Appliquer
                </Button>
                {hasFilters && (
                  <Link
                    href={`/tournament/${tournament.id}/matches`}
                  >
                    <Button
                      type="button"
                      className="text-xs px-3 py-1.5 bg-transparent border border-white/25 hover:border-red-400 rounded-full"
                    >
                      Réinitialiser
                    </Button>
                  </Link>
                )}
              </div>
            </form>
          </div>
        </section>

        {/* Matches list */}
        <section>
          <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
            {matches.length === 0 && (
              <Paragraph
                typeStyle="body-sm"
                textColor="text-gray-300"
              >
                Aucun match ne correspond aux filtres actuels.
              </Paragraph>
            )}

            {matches.length > 0 && (
              <div className="space-y-4">
                {grouped.map((day) => (
                  <div key={day.key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[11px] font-semibold text-gray-100">
                        {day.label}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        {day.matches.length} match
                        {day.matches.length > 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      {day.matches.map((m) => (
                        <MatchRow key={m.id} match={m} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Components & utils
 * ────────────────────────────────────────────*/

function MatchRow({ match }: { match: SimpleMatch }) {
  const t1 = match.team1?.short_name || match.team1?.name || "Équipe 1";
  const t2 =
    match.team2?.short_name ||
    match.team2?.name ||
    (match.is_bye ? "(bye)" : "Équipe 2");

  const dateLabel = formatMatchDate(match.scheduled_at);
  const statusLabel = getMatchStatusShort(match.status);
  const statusColor = getMatchStatusColor(match.status);

  const scoreLabel =
    match.status === "finished"
      ? `${match.team1_score ?? 0} - ${match.team2_score ?? 0}`
      : "";

  return (
    <Link href={`/match/${match.id}`}>
      <div className="group grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.5fr)_minmax(0,0.7fr)] gap-2 items-center px-2 py-1.5 rounded-xl bg-white/3 border border-white/10 hover:border-emerald-400/70 hover:bg-emerald-500/5 cursor-pointer transition-colors text-[11px]">
        {/* Teams */}
        <div className="flex flex-col">
          <p className="text-gray-100 truncate">
            {t1}{" "}
            {!match.is_bye && (
              <>
                <span className="text-gray-500">vs</span> {t2}
              </>
            )}
            {match.is_bye && (
              <span className="text-gray-500"> (bye)</span>
            )}
          </p>
          <div className="flex flex-wrap gap-2 text-[10px] text-gray-400">
            {match.stage && (
              <span>{match.stage.name}</span>
            )}
            {match.round_name && (
              <>
                <span className="text-gray-600">·</span>
                <span>{match.round_name}</span>
              </>
            )}
            {match.match_format && (
              <>
                <span className="text-gray-600">·</span>
                <span>{match.match_format.toUpperCase()}</span>
              </>
            )}
          </div>
        </div>

        {/* Time */}
        <div className="flex flex-col items-start">
          <span className="text-[10px] text-gray-300">
            {dateLabel || "Horaire à confirmer"}
          </span>
        </div>

        {/* Status / score */}
        <div className="flex flex-col items-end justify-center gap-[2px]">
          <span className={statusColor}>{statusLabel}</span>
          {scoreLabel && (
            <span className="text-[11px] font-semibold text-emerald-300">
              {scoreLabel}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function groupMatchesByDay(matches: SimpleMatch[]): {
  key: string;
  label: string;
  matches: SimpleMatch[];
}[] {
  const groups = new Map<
    string,
    { key: string; label: string; matches: SimpleMatch[] }
  >();

  for (const m of matches) {
    const d = m.scheduled_at ? new Date(m.scheduled_at) : null;
    const key = d
      ? d.toISOString().slice(0, 10)
      : "unscheduled";
    const label = d
      ? d.toLocaleDateString("fr-FR", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
        })
      : "Date à définir";

    if (!groups.has(key)) {
      groups.set(key, { key, label, matches: [] });
    }
    groups.get(key)!.matches.push(m);
  }

  const arr = Array.from(groups.values());
  arr.sort((a, b) => {
    if (a.key === "unscheduled") return 1;
    if (b.key === "unscheduled") return -1;
    return a.key.localeCompare(b.key);
  });

  return arr;
}

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

function formatMatchDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function getMatchStatusShort(status: MatchStatus): string {
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

function getMatchStatusColor(status: MatchStatus): string {
  switch (status) {
    case "pending":
      return "px-1.5 py-[2px] rounded-full bg-yellow-500/20 text-yellow-200 border border-yellow-500/60";
    case "ongoing":
      return "px-1.5 py-[2px] rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-500/60";
    case "finished":
      return "px-1.5 py-[2px] rounded-full bg-gray-500/20 text-gray-200 border border-gray-500/60";
    case "cancelled":
      return "px-1.5 py-[2px] rounded-full bg-red-500/20 text-red-200 border border-red-500/60";
    default:
      return "px-1.5 py-[2px] rounded-full bg-white/10 text-white border border-white/30";
  }
}
