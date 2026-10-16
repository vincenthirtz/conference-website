// utils/tournament/landingMatches.ts
//
// Tout ce que la landing /tournament/[id] tire des matchs, depuis UNE lecture.
//
// POURQUOI. La page lisait les matchs cinq fois à chaque régénération : le
// bloc de suivi, deux `count` (total, terminés), l'aperçu des manches, puis le
// premier coup d'envoi — cette dernière après toutes les autres. Les quatre
// dernières se déduisent de la première, qui ramène déjà tous les matchs non
// annulés du tournoi (quelques dizaines).
//
// UN ÉCART ASSUMÉ : les lectures retirées ne filtraient pas `deleted_at` (sauf
// le coup d'envoi). Un match supprimé (corbeille) comptait donc encore dans
// « N matchs » et dans l'aperçu des manches ; il n'y compte plus.
//
// PURE : aucune base, testable telle quelle.

import type { HubMatch, HubTeam } from '@/utils/tournament/liveHub';
import type { LandingRound } from '@/components/tournament/landing/types';

/** Une ligne de la lecture des matchs de la landing (embeds non dénoués). */
export type LandingMatchRow = Omit<HubMatch, 'team1' | 'team2'> & {
  round_number: number | null;
  bracket_side: string | null;
  // Embeds `team1:…` / `team2:…` : objet ou tableau selon PostgREST.
  team1: HubTeam | HubTeam[] | null;
  team2: HubTeam | HubTeam[] | null;
};

export type LandingMatchSummary = {
  /** Les matchs du bloc de suivi, au format exact de `buildLiveHub`. */
  hubMatches: HubMatch[];
  /** Une entrée par (manche, côté de bracket), dans l'ordre des manches. */
  rounds: LandingRound[];
  /** Matchs non annulés (exempts compris, comme le `count` d'avant). */
  totalMatches: number;
  /** Matchs au statut `finished`. */
  finishedMatchesCount: number;
  /**
   * Coup d'envoi RÉEL : l'horodatage du premier match programmé. `start_date`
   * est une date nue, que `new Date()` lit à minuit UTC (2 h du matin à
   * Paris) ; le compte à rebours tombait à zéro dix-sept heures trop tôt.
   */
  kickoffAt: string | null;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function sideOf(raw: string | null): LandingRound['side'] {
  return raw === 'wb' || raw === 'lb' || raw === 'final' ? raw : 'none';
}

/** Matchs déjà filtrés par la requête : non annulés, non supprimés. */
export function summarizeLandingMatches(
  rows: LandingMatchRow[]
): LandingMatchSummary {
  // Projection explicite : les colonnes ajoutées pour les manches ne doivent
  // pas finir dans les props sérialisées du bloc de suivi.
  const hubMatches: HubMatch[] = rows.map((m) => ({
    id: m.id,
    scheduled_at: m.scheduled_at,
    status: m.status,
    is_bye: m.is_bye,
    round_name: m.round_name,
    match_format: m.match_format,
    team1_score: m.team1_score,
    team2_score: m.team2_score,
    winner_team_id: m.winner_team_id,
    forfeit_team_id: m.forfeit_team_id,
    stream_url: m.stream_url,
    team1: one(m.team1),
    team2: one(m.team2),
  }));

  // Ordre de l'ancienne lecture (`order by round_number`, NULL en dernier) :
  // le premier nom de manche rencontré est celui qu'on garde.
  const byRound = rows
    .slice()
    .sort(
      (a, b) =>
        (a.round_number ?? Number.POSITIVE_INFINITY) -
        (b.round_number ?? Number.POSITIVE_INFINITY)
    );
  const roundMap = new Map<string, LandingRound>();
  for (const r of byRound) {
    const side = sideOf(r.bracket_side);
    const number = r.round_number ?? 0;
    const key = `${side}:${number}`;
    const existing = roundMap.get(key);
    if (existing) {
      existing.matchCount += 1;
      existing.name = existing.name ?? r.round_name ?? null;
    } else {
      roundMap.set(key, {
        number,
        name: r.round_name ?? null,
        matchCount: 1,
        side,
      });
    }
  }
  const rounds = Array.from(roundMap.values()).sort(
    (a, b) => a.number - b.number
  );

  let kickoffAt: string | null = null;
  let kickoffMs = Number.POSITIVE_INFINITY;
  for (const m of rows) {
    if (!m.scheduled_at) continue;
    const at = Date.parse(m.scheduled_at);
    if (Number.isNaN(at) || at >= kickoffMs) continue;
    kickoffMs = at;
    kickoffAt = m.scheduled_at;
  }

  return {
    hubMatches,
    rounds,
    totalMatches: rows.length,
    finishedMatchesCount: rows.filter((m) => m.status === 'finished').length,
    kickoffAt,
  };
}
