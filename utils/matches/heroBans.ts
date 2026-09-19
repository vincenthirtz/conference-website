// utils/matches/heroBans.ts
// Bans de héros et map choisie, par partie — colonnes `games.hero_bans` et
// `games.picked_by_team_id` (migration games_map_pick_and_hero_bans.sql).
//
// La base ne vérifie que la FORME (un tableau). Tout le reste se décide ici,
// à l'écriture : un héros inconnu du manifeste ou une équipe étrangère au match
// ne doit jamais atteindre les stats publiques, où il deviendrait une ligne
// « ??? — 3 bans » que personne ne saurait corriger.
//
// Logique PURE : aucun accès base.

import owHeroesJson from '../../lib/data/ow-heroes.json';
import { loadHeroes, type OwHero } from '../caster/heroBans';

export type HeroBan = { team_id: string; hero: string };

/** Héros Overwatch connus (clé stable + nom affiché FR). */
export const OW_HEROES: OwHero[] = loadHeroes(owHeroesJson);

const HERO_BY_KEY = new Map(OW_HEROES.map((h) => [h.key, h]));

/**
 * Plafond par équipe et par map. Le format actuel en prévoit UN ; la marge
 * absorbe un règlement qui passerait à deux sans bloquer la saisie, et refuse
 * encore une saisie manifestement fausse.
 */
export const MAX_BANS_PER_TEAM = 2;

export type HeroBansError =
  | 'hero_bans_not_array'
  | 'hero_ban_invalid'
  | 'hero_unknown'
  | 'hero_ban_team_not_in_match'
  | 'hero_banned_twice'
  | 'too_many_bans'
  | 'picked_by_not_in_match';

export function heroName(key: string): string {
  return HERO_BY_KEY.get(key)?.name ?? key;
}

export function heroRole(key: string): string | null {
  return HERO_BY_KEY.get(key)?.role ?? null;
}

/**
 * Valide les bans d'une partie. `teamIds` = les deux équipes du match.
 * `undefined`/`null` → aucun ban (tableau vide), pour que les anciens
 * clients qui n'envoient pas le champ n'effacent rien de travers.
 */
export function normalizeHeroBans(
  raw: unknown,
  teamIds: readonly (string | null)[]
): { ok: true; bans: HeroBan[] } | { ok: false; error: HeroBansError } {
  if (raw === undefined || raw === null) return { ok: true, bans: [] };
  if (!Array.isArray(raw)) return { ok: false, error: 'hero_bans_not_array' };

  const allowed = new Set(teamIds.filter((id): id is string => !!id));
  const seen = new Set<string>();
  const perTeam = new Map<string, number>();
  const bans: HeroBan[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      return { ok: false, error: 'hero_ban_invalid' };
    }
    const { team_id, hero } = item as { team_id?: unknown; hero?: unknown };
    // Ligne ajoutée puis laissée sans héros dans le formulaire : ignorée,
    // pas refusée — l'équipe y est pré-remplie, le héros jamais.
    if (hero === '' || hero == null) continue;
    if (typeof team_id !== 'string' || typeof hero !== 'string') {
      return { ok: false, error: 'hero_ban_invalid' };
    }
    if (!HERO_BY_KEY.has(hero)) return { ok: false, error: 'hero_unknown' };
    if (!allowed.has(team_id)) {
      return { ok: false, error: 'hero_ban_team_not_in_match' };
    }
    if (seen.has(hero)) return { ok: false, error: 'hero_banned_twice' };
    const count = (perTeam.get(team_id) ?? 0) + 1;
    if (count > MAX_BANS_PER_TEAM) return { ok: false, error: 'too_many_bans' };
    seen.add(hero);
    perTeam.set(team_id, count);
    bans.push({ team_id, hero });
  }
  return { ok: true, bans };
}

/** Valide l'équipe qui a choisi la map (`null`/`''` = imposée ou inconnue). */
export function normalizePickedBy(
  raw: unknown,
  teamIds: readonly (string | null)[]
): { ok: true; teamId: string | null } | { ok: false; error: HeroBansError } {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, teamId: null };
  }
  if (typeof raw === 'string' && teamIds.includes(raw)) {
    return { ok: true, teamId: raw };
  }
  return { ok: false, error: 'picked_by_not_in_match' };
}

/** Lecture tolérante d'une valeur venue de la base (jsonb). */
export function readHeroBans(value: unknown): HeroBan[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (b): b is HeroBan =>
      !!b &&
      typeof b === 'object' &&
      typeof (b as HeroBan).team_id === 'string' &&
      typeof (b as HeroBan).hero === 'string'
  );
}

export type HeroBanStat = {
  hero: string;
  name: string;
  role: string | null;
  bans: number;
  /** Part des maps (renseignées) où ce héros a été banni, 0–1. */
  rate: number;
  /** Nombre de bans par équipe qui a banni. */
  byTeam: { teamId: string; count: number }[];
};

/**
 * Agrège les bans d'un ensemble de parties. Seules les parties qui PORTENT des
 * bans comptent au dénominateur : une map saisie sans bans (ancien match,
 * saisie partielle) ne doit pas diluer les taux.
 */
export function computeHeroBanStats(games: { hero_bans?: unknown }[]): {
  mapsWithBans: number;
  heroes: HeroBanStat[];
} {
  let mapsWithBans = 0;
  const agg = new Map<string, Map<string, number>>();

  for (const g of games) {
    const bans = readHeroBans(g.hero_bans);
    if (bans.length === 0) continue;
    mapsWithBans += 1;
    for (const b of bans) {
      const byTeam = agg.get(b.hero) ?? new Map<string, number>();
      byTeam.set(b.team_id, (byTeam.get(b.team_id) ?? 0) + 1);
      agg.set(b.hero, byTeam);
    }
  }

  const heroes: HeroBanStat[] = Array.from(agg.entries()).map(
    ([hero, byTeam]) => {
      const bans = Array.from(byTeam.values()).reduce((a, b) => a + b, 0);
      return {
        hero,
        name: heroName(hero),
        role: heroRole(hero),
        bans,
        rate: mapsWithBans > 0 ? bans / mapsWithBans : 0,
        byTeam: Array.from(byTeam.entries())
          .map(([teamId, count]) => ({ teamId, count }))
          .sort((a, b) => b.count - a.count),
      };
    }
  );
  heroes.sort((a, b) => b.bans - a.bans || a.name.localeCompare(b.name, 'fr'));
  return { mapsWithBans, heroes };
}

/**
 * Les picks saisis sur les parties, au format des lignes de veto — pour que les
 * stats de maps les comptent comme les picks faits au veto.
 *
 * Un match qui a DÉJÀ des picks au veto garde ceux-là seuls : la même map
 * choisie par la même équipe serait sinon comptée deux fois.
 */
export function vetoPicksFromGames<
  G extends {
    match_id: string;
    map_name: string | null;
    picked_by_team_id?: string | null;
  },
>(
  games: G[],
  vetos: { match_id: string; action: string }[]
): { match_id: string; action: 'pick'; team_id: string; map_name: string }[] {
  const vetoPicked = new Set(
    vetos.filter((v) => v.action === 'pick').map((v) => v.match_id)
  );
  return games
    .filter(
      (g) => g.picked_by_team_id && g.map_name && !vetoPicked.has(g.match_id)
    )
    .map((g) => ({
      match_id: g.match_id,
      action: 'pick' as const,
      team_id: g.picked_by_team_id as string,
      map_name: g.map_name as string,
    }));
}
