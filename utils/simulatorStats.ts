// utils/simulatorStats.ts
//
// Les agrégats affichés par le simulateur de tournoi pour l'occurrence
// courante : volumes, victoires/défaites, maps, prochaine manche, durée,
// compétitivité. Pur — sorti de `pages/admin/tournament-simulator.tsx`, où il
// vivait dans un `useMemo` (règle A7, lot 3).

import { computeCompetitiveness } from '@/utils/simulator';
import type { SimStage, SimTeam } from '@/utils/simulator';

export function computeSimStats(stages: SimStage[], teams: SimTeam[]) {
  const allMatches = stages.flatMap((s) => s.matches);
  const total = allMatches.length;
  const finished = allMatches.filter((m) => m.status === 'finished').length;
  const pending = allMatches.filter((m) => m.status === 'pending').length;

  // Win counts + score differential
  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
  const mapWins = new Map<string, number>(); // maps won (individual)
  const mapLosses = new Map<string, number>();
  for (const m of allMatches) {
    if (m.status !== 'finished' || !m.winner_team_id) continue;
    wins.set(m.winner_team_id, (wins.get(m.winner_team_id) ?? 0) + 1);
    const loserId = m.team1_id === m.winner_team_id ? m.team2_id : m.team1_id;
    if (loserId) losses.set(loserId, (losses.get(loserId) ?? 0) + 1);

    // Per-team map score tracking
    if (m.team1_id && m.team1_score != null && m.team2_score != null) {
      mapWins.set(m.team1_id, (mapWins.get(m.team1_id) ?? 0) + m.team1_score);
      mapLosses.set(
        m.team1_id,
        (mapLosses.get(m.team1_id) ?? 0) + m.team2_score
      );
    }
    if (m.team2_id && m.team1_score != null && m.team2_score != null) {
      mapWins.set(m.team2_id, (mapWins.get(m.team2_id) ?? 0) + m.team2_score);
      mapLosses.set(
        m.team2_id,
        (mapLosses.get(m.team2_id) ?? 0) + m.team1_score
      );
    }
  }

  // Map usage
  const mapCount = new Map<string, number>();
  for (const m of allMatches) {
    for (const map of m.maps) {
      mapCount.set(map.name, (mapCount.get(map.name) ?? 0) + 1);
    }
  }

  // Next playable round
  const playableMatches = allMatches.filter(
    (m) => m.status === 'pending' && m.team1 && m.team2
  );
  const nextRound =
    playableMatches.length > 0
      ? Math.min(...playableMatches.map((m) => m.round_number))
      : null;
  const nextRoundName =
    playableMatches.find((m) => m.round_number === nextRound)?.round_name ??
    null;

  // Estimated duration
  const scheduledDates = allMatches
    .map((m) => m.scheduled_at)
    .filter(Boolean) as string[];
  let estimatedDuration: string | null = null;
  if (scheduledDates.length >= 2) {
    const sorted = scheduledDates.sort();
    const first = new Date(sorted[0]);
    const last = new Date(sorted[sorted.length - 1]);
    const diffMs = last.getTime() - first.getTime();
    const hours = Math.round(diffMs / (1000 * 60 * 60));
    if (hours < 24) estimatedDuration = `${hours}h`;
    // `floor`, pas `ceil` : le reste est déjà affiché en heures (27 h → 1j 3h,
    // et non 2j 3h comme avant la sortie de ce calcul de la page).
    else estimatedDuration = `${Math.floor(hours / 24)}j ${hours % 24}h`;
  }

  const competitiveness = computeCompetitiveness(allMatches, teams);

  return {
    total,
    finished,
    pending,
    wins,
    losses,
    mapWins,
    mapLosses,
    mapCount,
    nextRound,
    nextRoundName,
    estimatedDuration,
    competitiveness,
  };
}

export type SimStats = ReturnType<typeof computeSimStats>;
