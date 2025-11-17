// pages/admin/tournament/[id]/bracket-builder.tsx

import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { withStaffPage } from "@/utils/staff";
import { StaffRoleBadge } from "@/components/admin/StaffRoleBadge";

type StaffProps= {
  id: string;                // plus de `| null`
  role: string;
  display_name: string | null;
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

type BracketMatch = {
  id: string;
  tournament_id: string;
  stage_id: string | null;
  stage_name?: string | null;
  stage_type?: StageType | null;

  round_number: number | null;
  position_in_round: number | null;

  status: MatchStatus;
  best_of: number | null;

  scheduled_at: string | null;

  team1_id: string | null;
  team2_id: string | null;
  team1?: TeamMini | null;
  team2?: TeamMini | null;

  winner_team_id: string | null;

  // liens de propagation (optionnels)
  next_match_win_id?: string | null;
  next_match_lose_id?: string | null;

  // infos de layout calculées côté backend (optionnel)
  column_index?: number | null;
  row_index?: number | null;
};

type BracketApiResponse = {
  tournament: {
    id: string;
    name: string;
    slug: string | null;
  } | null;
  stage?: {
    id: string;
    name: string;
    stage_type: StageType | null;
  } | null;
  matches: BracketMatch[];
};

export const getServerSideProps = withStaffPage("manager");

/** Format date courte */
function formatShortDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** Label de colonne / round */
function roundLabel(columnIndex: number, totalColumns: number) {
  if (columnIndex === totalColumns - 1) return "Finale";
  if (columnIndex === totalColumns - 2) return "Demi-finales";
  if (columnIndex === totalColumns - 3) return "Quarts";
  return `Round ${columnIndex + 1}`;
}

type DragPayload = {
  matchId: string;
  slot: 1 | 2;
};

function AdminBracketBuilderPage({ staff }: StaffProps) {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const [tournament, setTournament] = useState<BracketApiResponse["tournament"]>(
    null
  );
  const [stage, setStage] = useState<BracketApiResponse["stage"] | null>(null);
  const [matches, setMatches] = useState<BracketMatch[]>([]);

  // Pour savoir si quelque chose a été modifié
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchBracket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function fetchBracket() {
    if (!id) return;
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);
    setDirty(false);

    try {
      // 👉 Si ton endpoint diffère, adapte ici.
      // On suppose : GET /api/admin/tournament/[id]/matches?layout=bracket&limit=512&includeGraph=1
      const res = await fetch(
        `/api/admin/tournament/${id}/matches?layout=bracket&limit=512&includeGraph=1`
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Impossible de charger le bracket");
      }

      const json: BracketApiResponse = await res.json();
      setTournament(json.tournament);
      setStage(json.stage ?? null);
      setMatches(json.matches || []);
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }

  /** Calcul des colonnes pour afficher l'arbre */
  const columns = useMemo(() => {
    if (!matches.length) return [] as BracketMatch[][];

    // Si column_index est fourni, on l'utilise, sinon fallback sur round_number.
    const colMap = new Map<number, BracketMatch[]>();

    for (const m of matches) {
      const col =
        (m.column_index ?? undefined) ??
        (m.round_number != null ? m.round_number - 1 : 0);

      if (!colMap.has(col)) colMap.set(col, []);
      colMap.get(col)!.push(m);
    }

    const sortedCols = Array.from(colMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, arr]) =>
        arr.slice().sort((a, b) => {
          const ra = a.row_index ?? a.position_in_round ?? 0;
          const rb = b.row_index ?? b.position_in_round ?? 0;
          return ra - rb;
        })
      );

    return sortedCols;
  }, [matches]);

  const totalColumns = columns.length;

  /** Gestion drag & drop */

  function onDragStart(
    e: React.DragEvent<HTMLDivElement>,
    payload: DragPayload
  ) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/json", JSON.stringify(payload));
  }

  function onDragOverSlot(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function onDropOnSlot(
    e: React.DragEvent<HTMLDivElement>,
    targetMatchId: string,
    targetSlot: 1 | 2
  ) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/json");
    if (!raw) return;

    let payload: DragPayload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    const { matchId: sourceMatchId, slot: sourceSlot } = payload;

    // Si on drop sur le même slot, on ne fait rien
    if (sourceMatchId === targetMatchId && sourceSlot === targetSlot) {
      return;
    }

    setMatches((prev) => {
      const copy = prev.map((m) => ({ ...m }));

      const sourceMatch = copy.find((m) => m.id === sourceMatchId);
      const targetMatch = copy.find((m) => m.id === targetMatchId);
      if (!sourceMatch || !targetMatch) return prev;

      const sourceTeamId =
        sourceSlot === 1 ? sourceMatch.team1_id : sourceMatch.team2_id;
      const sourceTeamObj =
        sourceSlot === 1 ? sourceMatch.team1 || null : sourceMatch.team2 || null;

      const targetTeamId =
        targetSlot === 1 ? targetMatch.team1_id : targetMatch.team2_id;
      const targetTeamObj =
        targetSlot === 1 ? targetMatch.team1 || null : targetMatch.team2 || null;

      // Échange entre source & target (swap)
      if (sourceSlot === 1) {
        sourceMatch.team1_id = targetTeamId;
        sourceMatch.team1 = targetTeamObj;
      } else {
        sourceMatch.team2_id = targetTeamId;
        sourceMatch.team2 = targetTeamObj;
      }

      if (targetSlot === 1) {
        targetMatch.team1_id = sourceTeamId;
        targetMatch.team1 = sourceTeamObj;
      } else {
        targetMatch.team2_id = sourceTeamId;
        targetMatch.team2 = sourceTeamObj;
      }

      return copy;
    });

    setDirty(true);
  }

  function clearSlot(matchId: string, slot: 1 | 2) {
    setMatches((prev) =>
      prev.map((m) => {
        if (m.id !== matchId) return m;
        const clone = { ...m };
        if (slot === 1) {
          clone.team1_id = null;
          clone.team1 = null;
        } else {
          clone.team2_id = null;
          clone.team2 = null;
        }
        return clone;
      })
    );
    setDirty(true);
  }

  /** Enregistrement des changements (batch) */
  async function handleSave() {
    if (!id) return;
    setSaving(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      // On envoie uniquement les slots d'équipes (pour rester léger)
      const payload = {
        matches: matches.map((m) => ({
          id: m.id,
          team1_id: m.team1_id,
          team2_id: m.team2_id,
        })),
      };

      // 👉 Adapte si tu préfères PATCH /api/admin/tournament/[id]/matches
      const res = await fetch(`/api/admin/tournament/${id}/bracket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          json.error || "Erreur lors de l’enregistrement du bracket"
        );
      }

      await res.json();
      setInfoMsg("Bracket enregistré avec succès.");
      setDirty(false);
      fetchBracket(); // re-sync
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Erreur inconnue lors de l’enregistrement");
    } finally {
      setSaving(false);
    }
  }

  const backUrl = `/admin/tournament/${id}`;

  return (
    <>
      <Head>
        <title>Admin – Bracket builder</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <button
              type="button"
              onClick={() => router.push(backUrl)}
              className="mb-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
            >
              ← Retour au tournoi
            </button>
            <h1 className="text-3xl font-bold">Bracket builder</h1>
            {tournament && (
              <p className="text-neutral-400 text-sm mt-1">
                Tournoi :{" "}
                <span className="font-semibold">{tournament.name}</span>
                {tournament.slug && (
                  <>
                    {" "}
                    <span className="font-mono bg-neutral-800 border border-neutral-700 px-2 py-0.5 rounded text-xs">
                      {tournament.slug}
                    </span>
                  </>
                )}
              </p>
            )}
            {stage && (
              <p className="text-neutral-400 text-xs mt-1">
                Phase :{" "}
                <Link
                  href={`/admin/stages/${stage.id}`}
                  className="underline underline-offset-2 hover:text-white"
                >
                  {stage.name}
                </Link>{" "}
                {stage.stage_type && (
                  <span className="uppercase tracking-wide text-[10px] ml-1 bg-neutral-800 border border-neutral-700 px-1.5 py-0.5 rounded">
                    {stage.stage_type}
                  </span>
                )}
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
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            type="button"
            onClick={fetchBracket}
            disabled={loading || saving}
            className={`px-4 py-2 rounded text-sm border border-neutral-600 ${
              loading
                ? "bg-neutral-800 cursor-wait"
                : "bg-neutral-800 hover:bg-neutral-700"
            }`}
          >
            Recharger depuis le serveur
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className={`px-4 py-2 rounded text-sm font-semibold ${
              saving || !dirty
                ? "bg-blue-900/70 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {saving
              ? "Enregistrement…"
              : dirty
              ? "Enregistrer les changements"
              : "Aucun changement"}
          </button>

          <span className="text-xs text-neutral-500">
            Astuce : glisse-dépose un slot d’équipe vers un autre pour les
            échanger.
          </span>
        </div>

        {/* Bracket */}
        {loading && (
          <div className="text-neutral-300">
            Chargement du bracket…
          </div>
        )}

        {!loading && columns.length === 0 && (
          <div className="text-neutral-300">
            Aucun match de bracket trouvé pour ce tournoi / cette phase.
          </div>
        )}

        {!loading && columns.length > 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 overflow-x-auto">
            <div className="flex items-stretch gap-6 pt-20 min-w-full">
              {columns.map((col, colIndex) => (
                <div key={colIndex} className="flex-1 min-w-[220px]">
                  <h2 className="text-sm font-semibold text-neutral-200 mb-3 text-center">
                    {roundLabel(colIndex, totalColumns)}
                  </h2>

                  <div className="flex flex-col gap-4">
                    {col.map((match) => (
                      <BracketMatchCard
                        key={match.id}
                        match={match}
                        onDragStart={onDragStart}
                        onDragOverSlot={onDragOverSlot}
                        onDropOnSlot={onDropOnSlot}
                        onClearSlot={clearSlot}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

type BracketMatchCardProps = {
  match: BracketMatch;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, payload: DragPayload) => void;
  onDragOverSlot: (e: React.DragEvent<HTMLDivElement>) => void;
  onDropOnSlot: (
    e: React.DragEvent<HTMLDivElement>,
    matchId: string,
    slot: 1 | 2
  ) => void;
  onClearSlot: (matchId: string, slot: 1 | 2) => void;
};

function BracketMatchCard({
  match,
  onDragStart,
  onDragOverSlot,
  onDropOnSlot,
  onClearSlot,
}: BracketMatchCardProps) {
  return (
    <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-3 shadow-sm">
      <div className="flex justify-between items-center mb-2 text-[11px] text-neutral-400">
        <div className="flex items-center gap-2">
          <span className="font-mono bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-700">
            #{match.id.slice(0, 6)}
          </span>
          {match.round_number && (
            <span>
              R{match.round_number}
              {match.position_in_round
                ? ` • M${match.position_in_round}`
                : ""}
            </span>
          )}
        </div>
        <span className="text-[10px]">
          {match.best_of ? `BO${match.best_of}` : ""}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <TeamSlot
          label="Équipe 1"
          match={match}
          slot={1}
          team={match.team1}
          teamId={match.team1_id}
          isWinner={match.winner_team_id === match.team1_id}
          onDragStart={onDragStart}
          onDragOverSlot={onDragOverSlot}
          onDropOnSlot={onDropOnSlot}
          onClear={() => onClearSlot(match.id, 1)}
        />
        <TeamSlot
          label="Équipe 2"
          match={match}
          slot={2}
          team={match.team2}
          teamId={match.team2_id}
          isWinner={match.winner_team_id === match.team2_id}
          onDragStart={onDragStart}
          onDragOverSlot={onDragOverSlot}
          onDropOnSlot={onDropOnSlot}
          onClear={() => onClearSlot(match.id, 2)}
        />
      </div>

      {match.scheduled_at && (
        <div className="mt-2 text-[11px] text-neutral-500 flex justify-between items-center">
          <span>{formatShortDate(match.scheduled_at)}</span>
        </div>
      )}
    </div>
  );
}

type TeamSlotProps = {
  label: string;
  match: BracketMatch;
  slot: 1 | 2;
  team: TeamMini | null | undefined;
  teamId: string | null;
  isWinner: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, payload: DragPayload) => void;
  onDragOverSlot: (e: React.DragEvent<HTMLDivElement>) => void;
  onDropOnSlot: (
    e: React.DragEvent<HTMLDivElement>,
    matchId: string,
    slot: 1 | 2
  ) => void;
  onClear: () => void;
};

function TeamSlot({
  label,
  match,
  slot,
  team,
  teamId,
  isWinner,
  onDragStart,
  onDragOverSlot,
  onDropOnSlot,
  onClear,
}: TeamSlotProps) {
  const hasTeam = !!(team || teamId);

  return (
    <div
      className={`group relative flex items-center justify-between gap-2 px-2 py-1.5 rounded border text-xs ${
        hasTeam
          ? "bg-neutral-900 border-neutral-600"
          : "bg-neutral-900/40 border-dashed border-neutral-700"
      }`}
      onDragOver={onDragOverSlot}
      onDrop={(e) => onDropOnSlot(e, match.id, slot)}
    >
      <div
        className="flex items-center gap-2 flex-1 cursor-move"
        draggable={hasTeam}
        onDragStart={(e) =>
          hasTeam &&
          onDragStart(e, {
            matchId: match.id,
            slot,
          })
        }
      >
        {team?.logo_url && (
          <img
            src={team.logo_url}
            alt={team.name}
            className="w-6 h-6 rounded object-cover border border-neutral-700"
          />
        )}

        <div className="flex flex-col">
          <span
            className={`font-semibold ${
              isWinner ? "text-emerald-300" : "text-neutral-100"
            }`}
          >
            {team?.name || teamId || (
              <span className="text-neutral-500 italic">Slot vide</span>
            )}
          </span>
          <span className="text-[10px] text-neutral-500">{label}</span>
        </div>
      </div>

      {hasTeam && (
        <button
          type="button"
          onClick={onClear}
          className="text-[10px] text-neutral-500 hover:text-red-400 px-1 py-0.5 rounded"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default AdminBracketBuilderPage;
