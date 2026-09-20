// utils/tcg/readDrawPool.ts
//
// Le VIVIER du tirage : quelles joueuses et quelles équipes un paquet peut
// contenir. Lu par l'ouverture de paquet (`pages/api/player/tcg/packs.ts`) ET
// par les séries (`readCollectionSets.ts`).
//
// POURQUOI UN MODULE PARTAGÉ. Une série n'a de sens que si toutes ses cartes
// peuvent sortir d'un paquet. Si les séries relisaient le vivier avec leurs
// propres filtres, il suffirait qu'un des deux côtés change (`is_active`, un
// soft-delete, la borne) pour qu'une série exige une carte qu'aucun paquet ne
// peut donner — une joueuse bloquée à 5/6 sans le comprendre. Même règle que le
// dénominateur de la collection, qui lit `POOL_LIMIT` et `MAP_POOL_SLUGS` pour
// la même raison : UNE lecture, deux usages.
//
// Les maps n'y sont pas : leur vivier est le registre en mémoire
// (`MAP_POOL_SLUGS`), sans requête.

import { supabaseAdmin } from '@/utils/supabase';
import { POOL_LIMIT } from './drawPack';

export type DrawPool = {
  playerIds: string[];
  teamIds: string[];
  /** Fan arts VALIDÉES : elles partagent l'emplacement de décor avec les maps. */
  fanartIds: string[];
};

export type DrawPoolResult =
  | { ok: true; value: DrawPool }
  | { ok: false; error: string };

/**
 * Les deux viviers de base d'un espace. Ne lève jamais.
 *
 * Les filtres sont ceux que le tirage a toujours appliqués, au mot près :
 *   - joueuses : toute ligne `player_ratings` de l'espace ;
 *   - équipes : non supprimées ET actives. `is_active` est NULLABLE (défaut
 *     `true`) : `.neq('is_active', false)` exclurait les lignes NULL — en SQL,
 *     `NULL <> false` ne vaut pas vrai —, d'où le `or(...)` qui accepte les
 *     deux formes de « active ».
 */
/**
 * Les trois requêtes du vivier, à une projection près.
 *
 * LES FILTRES NE SONT ÉCRITS QU'ICI. C'est toute la raison d'être de ce
 * module : `readDrawPool` (qui veut les identifiants) et `readDrawPoolSizes`
 * (qui ne veut que les nombres) partent de la MÊME définition. Deux fonctions
 * qui recopieraient chacune `is_active.is.null,is_active.eq.true` finiraient
 * par ne plus décrire le même vivier — et le dénominateur de la collection
 * promettrait des cartes qu'aucun paquet ne peut donner.
 *
 * `head` : `true` ne rapatrie aucune ligne et ne demande que le compte.
 */
function poolQueries(tenantId: string, head: boolean) {
  const db = supabaseAdmin!;
  const count = head ? ({ count: 'exact', head: true } as const) : undefined;
  return [
    db
      .from('player_ratings')
      .select('user_id', count)
      .eq('tenant_id', tenantId)
      .limit(POOL_LIMIT),
    db
      .from('teams')
      .select('id', count)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .or('is_active.is.null,is_active.eq.true')
      .limit(POOL_LIMIT),
    // Fan arts : seules les APPROUVÉES. Une œuvre retirée (`revoked`) sort du
    // vivier immédiatement — le retrait doit valoir pour les paquets à venir,
    // même si les cartes déjà tirées, elles, restent (cf. la migration).
    db
      .from('tcg_fanart_cards')
      .select('id', count)
      .eq('tenant_id', tenantId)
      .eq('status', 'approved')
      .limit(POOL_LIMIT),
  ] as const;
}

export type DrawPoolSizes = {
  players: number;
  teams: number;
  fanarts: number;
};

export type DrawPoolSizesResult =
  | { ok: true; value: DrawPoolSizes }
  | { ok: false; error: string };

/**
 * La TAILLE du vivier, sans en rapatrier le contenu.
 *
 * POURQUOI CETTE VARIANTE EXISTE. Le dénominateur de la collection n'a besoin
 * que de trois entiers, et il est calculé à CHAQUE affichage. Le faire passer
 * par `readDrawPool` ramenait jusqu'à trois mille UUID — une centaine de
 * kilo-octets sur le réseau, à chaque ouverture d'une page qui n'en fait rien.
 * Les compteurs `head: true` ne rapportent que le nombre.
 *
 * Plafonné à `POOL_LIMIT` par l'appelant, comme les identifiants le sont par
 * `.limit()` : au delà, le tirage ne regarde pas les sujets suivants, donc les
 * compter rendrait la complétion inatteignable.
 */
export async function readDrawPoolSizes(
  tenantId: string
): Promise<DrawPoolSizesResult> {
  if (!supabaseAdmin) return { ok: false, error: 'supabaseAdmin absent' };

  const [playersRes, teamsRes, fanartRes] = await Promise.all(
    poolQueries(tenantId, true)
  );

  if (playersRes.error || teamsRes.error || fanartRes.error) {
    return {
      ok: false,
      error:
        playersRes.error?.message ??
        teamsRes.error?.message ??
        fanartRes.error?.message ??
        'inconnue',
    };
  }

  return {
    ok: true,
    value: {
      players: playersRes.count ?? 0,
      teams: teamsRes.count ?? 0,
      fanarts: fanartRes.count ?? 0,
    },
  };
}

export async function readDrawPool(tenantId: string): Promise<DrawPoolResult> {
  if (!supabaseAdmin) return { ok: false, error: 'supabaseAdmin absent' };

  const [playersRes, teamsRes, fanartRes] = await Promise.all(
    poolQueries(tenantId, false)
  );

  if (playersRes.error || teamsRes.error || fanartRes.error) {
    return {
      ok: false,
      error:
        playersRes.error?.message ??
        teamsRes.error?.message ??
        fanartRes.error?.message ??
        'inconnue',
    };
  }

  return {
    ok: true,
    value: {
      playerIds: ((playersRes.data ?? []) as Array<{ user_id: string }>).map(
        (r) => r.user_id
      ),
      teamIds: ((teamsRes.data ?? []) as Array<{ id: string }>).map(
        (r) => r.id
      ),
      fanartIds: ((fanartRes.data ?? []) as Array<{ id: string }>).map(
        (r) => r.id
      ),
    },
  };
}
