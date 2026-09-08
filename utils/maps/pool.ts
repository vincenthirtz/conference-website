// utils/maps/pool.ts
//
// Pool de cartes EFFECTIF d'un match, et normalisation d'un nom de carte.
//
// POURQUOI : le nom de carte d'une partie (`games.map_name`) était un champ
// TEXTE LIBRE dans l'écran d'arbitrage. Résultat en production : les 17 lignes
// de `games` portent « Map 1 », « Map 2 », « Map 3 » — aucune vraie carte, alors
// que le pool en compte trente. Toute statistique par carte
// (vue team_map_stats, /tournament/[id]/maps, /api/maps/stats) est donc
// structurellement vide de sens.
//
// Deux fonctions pures ici (testables sans base) et un résolveur qui lit la
// base. La saisie reste LIBRE — une partie peut se jouer sur une arène
// personnalisée hors pool — mais ce qui ressemble à une carte du pool est
// ramené à son orthographe canonique.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getGame, isGameSlug } from '@/config/games';

export type PoolMap = {
  name: string;
  type: string | null;
  image: string | null;
};

export type PoolSource = 'tournament' | 'tournament-round' | 'tenant' | 'defaults';

type PoolRow = {
  map_name: string;
  map_type: string | null;
  image_url: string | null;
  order_index: number | null;
};

/**
 * Relation « to-one » embarquée : PostgREST renvoie un OBJET, mais les typings
 * de supabase-js la déclarent en TABLEAU (il ne sait pas la cardinalité). On
 * accepte donc les deux formes plutôt que de forcer un cast qui mentirait.
 * PURE.
 */
export function toOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Ordre d'affichage : `order_index` d'abord (les lignes sans index passent en
 * dernier), puis alphabétique. PURE.
 */
export function sortPoolRows(rows: PoolRow[]): PoolMap[] {
  return [...rows]
    .sort((a, b) => {
      const ai = a.order_index;
      const bi = b.order_index;
      if (ai == null && bi != null) return 1;
      if (ai != null && bi == null) return -1;
      if (ai != null && bi != null && ai !== bi) return ai - bi;
      return a.map_name.localeCompare(b.map_name);
    })
    .map((r) => ({
      name: r.map_name,
      type: r.map_type ?? null,
      image: r.image_url ?? null,
    }));
}

/**
 * Identifiant de jeu canonique : minuscules, sans espaces autour.
 *
 * En base, `tenant_map_pool.game` et `tournaments.game` valent toujours le
 * slug minuscule, mais `scrims.game` porte aussi bien « overwatch » que
 * « Overwatch ». Sans ce passage, un scrim saisi avec la majuscule ne trouvait
 * AUCUNE carte : pool vide, aucune normalisation, et personne n'en saurait
 * rien. PURE.
 */
export function normalizeGameSlug(game: string | null | undefined): string | null {
  if (!game) return null;
  const slug = String(game).trim().toLowerCase();
  return slug || null;
}

/** Catalogue statique d'un jeu (config/games), dernier recours. PURE. */
export function staticPool(game: string | null): PoolMap[] {
  const slug = normalizeGameSlug(game);
  const def = slug && isGameSlug(slug) ? getGame(slug) : null;
  return (def?.mapPool ?? []).map((m) => ({
    name: m.name,
    type: m.type ?? null,
    image: m.image ?? null,
  }));
}

/**
 * Clé de comparaison d'un nom de carte : casse, accents, apostrophes et
 * ponctuation neutralisés. « kings row », « King's Row » et « KINGS-ROW »
 * donnent la même clé. PURE.
 */
export function mapNameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // diacritiques combinants
    .toLowerCase()
    // Les apostrophes sont SUPPRIMÉES, pas transformées en séparateur : sinon
    // « King's Row » donnerait « king s row » et « KINGS-ROW » « kings row »,
    // deux clés différentes pour la même carte.
    .replace(/['\u2019\u02bc]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Ramène un nom saisi à son orthographe canonique quand le pool le reconnaît.
 * Sinon renvoie la saisie nettoyée (espaces normalisés) : une arène
 * personnalisée reste saisissable. Chaîne vide → null. PURE.
 */
export function normalizeMapName(
  input: string | null | undefined,
  pool: PoolMap[]
): string | null {
  if (input == null) return null;
  const trimmed = String(input).replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;

  const key = mapNameKey(trimmed);
  if (!key) return trimmed;

  const canonical = pool.find((m) => mapNameKey(m.name) === key);
  return canonical ? canonical.name : trimmed;
}

/** Colonnes lues pour construire un pool. */
const POOL_COLUMNS = 'map_name, map_type, image_url, order_index';

/**
 * Cartes activées d'un tournoi pour une journée donnée.
 *
 * `round === null` cible le POOL PAR DÉFAUT (`round_number IS NULL`), pas
 * « toutes les journées » : sans ce filtre, ajouter le pool d'une journée
 * ferait apparaître ses cartes en double partout où le pool du tournoi est lu
 * (page publique, menu du caster, normalisation des noms à la saisie).
 */
async function tournamentPoolRows(
  client: SupabaseClient,
  tenantId: string,
  tournamentId: string,
  round: number | null
): Promise<PoolRow[] | null> {
  let query = client
    .from('tournament_maps')
    .select(POOL_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .eq('enabled', true);
  query = round === null ? query.is('round_number', null) : query.eq('round_number', round);

  const { data, error } = await query;
  if (error || !data || data.length === 0) return null;
  return data as PoolRow[];
}

/**
 * Pool effectif applicable à un match.
 *
 * Priorité : le pool de la JOURNÉE demandée (`roundNumber`), puis le pool par
 * défaut du tournoi — c'est la sélection que le staff a faite pour cette
 * compétition — puis le pool éditable du tenant pour le jeu, puis le catalogue
 * statique.
 *
 * Une journée sans pool propre retombe donc sur celui du tournoi : déclarer un
 * pool par journée reste facultatif, et les tournois qui n'en veulent pas ne
 * changent pas de comportement.
 *
 * `includeTournamentMaps: false` sert à l'action « ajouter les maps par
 * défaut » d'un tournoi, qui ALIMENTE `tournament_maps` et ne peut donc pas
 * s'en servir comme source.
 *
 * Ne jette jamais : en cas d'erreur base, on dégrade vers la source suivante.
 * Un pool indisponible ne doit pas empêcher d'enregistrer un score.
 */
export async function resolveEffectiveMapPool(
  client: SupabaseClient,
  params: {
    tenantId: string;
    tournamentId?: string | null;
    game?: string | null;
    includeTournamentMaps?: boolean;
    /** Journée (matches.round_number). Absent → pool par défaut du tournoi. */
    roundNumber?: number | null;
  }
): Promise<{ maps: PoolMap[]; source: PoolSource }> {
  const { tenantId, tournamentId, includeTournamentMaps = true } = params;
  const game = normalizeGameSlug(params.game);
  const round = Number.isFinite(params.roundNumber as number)
    ? (params.roundNumber as number)
    : null;

  if (includeTournamentMaps && tournamentId) {
    if (round !== null) {
      const rows = await tournamentPoolRows(client, tenantId, tournamentId, round);
      if (rows) return { maps: sortPoolRows(rows), source: 'tournament-round' };
    }
    const rows = await tournamentPoolRows(client, tenantId, tournamentId, null);
    if (rows) return { maps: sortPoolRows(rows), source: 'tournament' };
  }

  if (game) {
    const { data, error } = await client
      .from('tenant_map_pool')
      .select(POOL_COLUMNS)
      .eq('tenant_id', tenantId)
      .eq('game', game)
      .eq('enabled', true);
    if (!error && data && data.length > 0) {
      return { maps: sortPoolRows(data as PoolRow[]), source: 'tenant' };
    }
  }

  return { maps: staticPool(game ?? null), source: 'defaults' };
}
