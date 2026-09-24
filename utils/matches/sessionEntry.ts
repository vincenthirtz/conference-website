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
