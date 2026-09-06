// utils/matches/gamesFromVeto.ts
//
// Génération des parties (`games`) à partir d'un veto de cartes terminé.
//
// POURQUOI ce module : la logique existait en DEUX exemplaires — l'endpoint
// admin et l'endpoint bot du veto — et aucun des deux n'était sûr :
//
//   * pas d'idempotence : si le match avait déjà des parties (saisies à la
//     main, ou veto rejoué après déverrouillage), l'insertion en AJOUTAIT.
//     `games` n'a aucune contrainte d'unicité sur (match_id, map_order) : rien
//     n'aurait arrêté les doublons ;
//   * le reset du veto supprimait TOUTES les parties du match, y compris
//     celles portant des scores déjà enregistrés — une perte de données à un
//     clic.
//
// Règle retenue : une partie dont le score est saisi est INTOUCHABLE. Le veto
// remplit des parties vides, il n'écrase jamais un résultat.

import type { SupabaseClient } from '@supabase/supabase-js';

export type VetoStepLike = {
  action: string;
  map_name: string;
  step_number?: number | null;
};

export type ExistingGame = {
  id: string;
  team1_score: number | null;
  team2_score: number | null;
};

export type GamePayload = {
  tenant_id: string;
  match_id: string;
  map_name: string;
  map_order: number;
  team1_score: number;
  team2_score: number;
  is_tiebreaker: boolean;
  went_overtime: boolean;
};

/**
 * Cartes effectivement jouées, dans l'ordre : les `pick` et le `decider`.
 * Les `ban` sont écartés. PURE.
 */
export function pickedMapsFromSteps(steps: VetoStepLike[]): VetoStepLike[] {
  return [...steps]
    .sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0))
    .filter((s) => s.action === 'pick' || s.action === 'decider');
}

/** Lignes `games` correspondant aux cartes retenues. PURE. */
export function buildGamesPayload(
  steps: VetoStepLike[],
  tenantId: string,
  matchId: string
): GamePayload[] {
  return pickedMapsFromSteps(steps).map((s, idx) => ({
    tenant_id: tenantId,
    match_id: matchId,
    map_name: s.map_name,
    map_order: idx,
    team1_score: 0,
    team2_score: 0,
    // La carte d'appoint (decider) n'est jouée qu'en cas d'égalité.
    is_tiebreaker: s.action === 'decider',
    went_overtime: false,
  }));
}

/**
 * Une partie porte-t-elle un résultat ? Un 0-0 est une ligne vide, préparée
 * mais pas jouée ; tout le reste est un score saisi. PURE.
 */
export function hasRecordedScore(game: ExistingGame): boolean {
  return (game.team1_score ?? 0) !== 0 || (game.team2_score ?? 0) !== 0;
}

export type SyncOutcome =
  | { created: true; count: number }
  | { created: false; reason: 'aucune-carte' | 'scores-existants' | 'erreur' };

/**
 * Aligne les parties du match sur le veto. Idempotent : rejouer le veto
 * régénère les mêmes lignes au lieu de les empiler.
 *
 * S'abstient totalement dès qu'UNE partie porte un score : à ce stade le match
 * est arbitré, et le veto n'a plus à décider de quoi que ce soit.
 *
 * Ne jette jamais : un échec est journalisé par l'appelant via le résultat.
 */
export async function syncGamesFromVeto(
  client: SupabaseClient,
  params: { tenantId: string; matchId: string; steps: VetoStepLike[] }
): Promise<SyncOutcome> {
  const { tenantId, matchId, steps } = params;
  const payload = buildGamesPayload(steps, tenantId, matchId);
  if (payload.length === 0) return { created: false, reason: 'aucune-carte' };

  const { data: existing, error: readErr } = await client
    .from('games')
    .select('id, team1_score, team2_score')
    .eq('tenant_id', tenantId)
    .eq('match_id', matchId);

  if (readErr) return { created: false, reason: 'erreur' };

  const rows = (existing ?? []) as ExistingGame[];
  if (rows.some(hasRecordedScore)) {
    return { created: false, reason: 'scores-existants' };
  }

  if (rows.length > 0) {
    const { error: delErr } = await client
      .from('games')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('match_id', matchId);
    if (delErr) return { created: false, reason: 'erreur' };
  }

  const { error: insErr } = await client.from('games').insert(payload);
  if (insErr) return { created: false, reason: 'erreur' };

  return { created: true, count: payload.length };
}

/**
 * Suppression des parties lors d'un reset de veto. Même garde : on ne détruit
 * jamais un score saisi. Retourne le nombre de lignes supprimées, ou null si
 * rien n'a été touché.
 */
export async function clearGamesFromVeto(
  client: SupabaseClient,
  params: { tenantId: string; matchId: string }
): Promise<{ cleared: number } | { cleared: null; reason: 'scores-existants' | 'erreur' }> {
  const { tenantId, matchId } = params;

  const { data: existing, error: readErr } = await client
    .from('games')
    .select('id, team1_score, team2_score')
    .eq('tenant_id', tenantId)
    .eq('match_id', matchId);

  if (readErr) return { cleared: null, reason: 'erreur' };

  const rows = (existing ?? []) as ExistingGame[];
  if (rows.length === 0) return { cleared: 0 };
  if (rows.some(hasRecordedScore)) {
    return { cleared: null, reason: 'scores-existants' };
  }

  const { error: delErr } = await client
    .from('games')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('match_id', matchId);
  if (delErr) return { cleared: null, reason: 'erreur' };

  return { cleared: rows.length };
}
