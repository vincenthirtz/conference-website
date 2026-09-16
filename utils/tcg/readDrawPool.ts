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
export async function readDrawPool(tenantId: string): Promise<DrawPoolResult> {
  if (!supabaseAdmin) return { ok: false, error: 'supabaseAdmin absent' };

  const [playersRes, teamsRes, fanartRes] = await Promise.all([
    supabaseAdmin
      .from('player_ratings')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .limit(POOL_LIMIT),
    supabaseAdmin
      .from('teams')
      .select('id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .or('is_active.is.null,is_active.eq.true')
      .limit(POOL_LIMIT),
    // Fan arts : seules les APPROUVÉES. Une œuvre retirée (`revoked`) sort du
    // vivier immédiatement — le retrait doit valoir pour les paquets à venir,
    // même si les cartes déjà tirées, elles, restent (cf. la migration).
    supabaseAdmin
      .from('tcg_fanart_cards')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('status', 'approved')
      .limit(POOL_LIMIT),
  ]);

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
