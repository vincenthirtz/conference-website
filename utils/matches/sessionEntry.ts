// utils/matches/sessionEntry.ts
//
// Saisie d'une SOIRÉE de matchs (onglet Stats › Saisie de l'admin tournoi) :
// regrouper les matchs par jour (heure de Paris), repérer ceux dont les
// parties ne sont pas encore saisies, et choisir la soirée à ouvrir.
//
// Avant cet écran, la saisie des maps / picks / bans d'une soirée se faisait
// match par match depuis la fiche de chacun — ou, en pratique, en SQL direct
// sur la base de production.
//
// Logique PURE : aucun accès base, jour de référence injecté.

import { parisDayKey } from '@/utils/maps/roundPools';

export type SessionMatch = {
  id: string;
  scheduled_at: string | null;
  status: string;
  is_bye?: boolean | null;
  team1_id: string | null;
  team2_id: string | null;
  games?: unknown[] | null;
};

export type SessionDay<M extends SessionMatch> = {
  /** `YYYY-MM-DD`, heure de Paris. */
  day: string;
  matches: M[];
  /** Matchs de ce jour dont les parties restent à saisir. */
  toFill: number;
};

/** Statuts sans parties à saisir : forfait, annulé. */
const NO_ENTRY_STATUSES = new Set(['walkover', 'cancelled']);

/** Le match a-t-il des parties à saisir ? (équipes connues, rien de saisi) */
export function needsEntry(m: SessionMatch, todayKey: string): boolean {
  if (m.is_bye || NO_ENTRY_STATUSES.has(m.status)) return false;
  if (!m.team1_id || !m.team2_id) return false;
  const day = parisDayKey(m.scheduled_at);
  // Un match à venir n'a encore rien à saisir.
  if (!day || day > todayKey) return false;
  return !Array.isArray(m.games) || m.games.length === 0;
}

/** Jours ayant au moins un match (hors byes / annulés), du plus ancien au plus récent. */
export function groupMatchesByDay<M extends SessionMatch>(
  matches: M[],
  todayKey: string
): SessionDay<M>[] {
  const byDay = new Map<string, M[]>();
  for (const m of matches) {
    if (m.is_bye || m.status === 'cancelled') continue;
    const day = parisDayKey(m.scheduled_at);
    if (!day) continue;
    const list = byDay.get(day) ?? [];
    list.push(m);
    byDay.set(day, list);
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => ({
      day,
      matches: list.sort((a, b) =>
        (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? '')
      ),
      toFill: list.filter((m) => needsEntry(m, todayKey)).length,
    }));
}

/**
 * La soirée à ouvrir : la plus récente (jusqu'à aujourd'hui) qui a encore des
 * matchs à saisir ; sinon la plus récente jouée ; sinon la prochaine.
 */
export function defaultSessionDay(
  days: SessionDay<SessionMatch>[],
  todayKey: string
): string | null {
  const past = days.filter((d) => d.day <= todayKey);
  const withGaps = past.filter((d) => d.toFill > 0);
  if (withGaps.length > 0) return withGaps[withGaps.length - 1].day;
  if (past.length > 0) return past[past.length - 1].day;
  return days[0]?.day ?? null;
}

/* -------------------------------------------------------------------------- */
/* Emplacements de maps                                                        */
/* -------------------------------------------------------------------------- */

/** Une partie telle que l'éditeur la manipule (forme de MatchGameInput). */
export type DraftGame = {
  map_name: string;
  map_order: number;
  team1_score: number;
  team2_score: number;
  is_tiebreaker: boolean;
  went_overtime: boolean;
  picked_by_team_id: string | null;
  hero_bans: unknown[];
};

/**
 * Emplacements à ouvrir pour un format : un BO3 propose Map 1, Map 2 et
 * Map 3, dont 2 obligatoires (le minimum pour gagner la série). Format
 * inconnu : BO3, le format par défaut du circuit.
 */
export function mapSlots(format: string | null | undefined): {
  slots: number;
  required: number;
} {
  const n = Number(/^bo(\d+)$/i.exec((format ?? '').trim())?.[1]);
  const slots = Number.isInteger(n) && n >= 1 && n <= 9 ? n : 3;
  return { slots, required: Math.ceil(slots / 2) };
}

export function blankGame(order: number): DraftGame {
  return {
    map_name: '',
    map_order: order,
    team1_score: 0,
    team2_score: 0,
    is_tiebreaker: false,
    went_overtime: false,
    picked_by_team_id: null,
    hero_bans: [],
  };
}

/** Emplacement jamais touché : ni nom, ni score, ni pick, ni ban. */
export function isBlankGame(g: DraftGame): boolean {
  return (
    g.map_name.trim() === '' &&
    !g.team1_score &&
    !g.team2_score &&
    !g.picked_by_team_id &&
    g.hero_bans.length === 0 &&
    !g.is_tiebreaker &&
    !g.went_overtime
  );
}

export type PrepareResult<G extends DraftGame> =
  | { ok: true; games: G[] }
  | { ok: false; error: 'unnamed_map' | 'missing_required'; count?: number };

/**
 * Ce qui part à l'enregistrement : les emplacements vides sont retirés (une
 * Map 3 non jouée n'est pas une partie), l'ordre est renuméroté. Refusé :
 * une map remplie sans nom, ou moins de maps que le minimum du format.
 * Aucune map du tout est accepté (rien à enregistrer côté parties).
 */
export function prepareGamesForSave<G extends DraftGame>(
  games: G[],
  required: number
): PrepareResult<G> {
  const filled = games.filter((g) => !isBlankGame(g));
  if (filled.some((g) => g.map_name.trim() === '')) {
    return { ok: false, error: 'unnamed_map' };
  }
  if (filled.length > 0 && filled.length < required) {
    return { ok: false, error: 'missing_required', count: required };
  }
  return {
    ok: true,
    games: filled.map((g, i) => ({ ...g, map_order: i })),
  };
}
