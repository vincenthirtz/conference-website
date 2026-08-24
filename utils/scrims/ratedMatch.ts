// utils/scrims/ratedMatch.ts
//
// Rattachement d'un scrim au CLASSEMENT DES JOUEUSES (Glicko-2).
//
// Décision produit (2026-08-24) : un scrim classé compte pour le rating, au
// même titre qu'un match de tournoi. Ça revient sur le cloisonnement d'origine
// (cf. l'en-tête de `utils/scrims/ladder.ts`, mis à jour en conséquence) : le
// ladder d'entraînement reste, mais il n'est plus le SEUL débouché d'un scrim.
// Le garde-fou n'est plus le type d'épreuve, c'est le drapeau `ranked` — un
// scrim d'entraînement à roster incomplet se coche `ranked = false` et ne
// touche à rien.
//
// COMMENT, et pourquoi ainsi : plutôt que d'apprendre les scrims au moteur de
// rating, on MIROITE le scrim dans une ligne `matches` (avec `scrim_id`, sans
// `tournament_id`). Tout le reste suit sans être touché :
//   - `snapshotMatchParticipants` fige le roster,
//   - `applyMatchRatingIncremental` note la partie,
//   - `rebuildRatings` la rejoue (il ne filtre que sur statut / vainqueur /
//     deux équipes — jamais sur l'appartenance à un tournoi),
//   - le H2H, le profil joueuse et la page du scrim l'affichent.
// Une seule source de vérité pour « une partie notée », et aucune duplication
// de la logique Glicko.
//
// Le miroir est réconcilié, pas empilé : un scrim qui cesse d'être éligible
// (dé-classé, rouvert, mis en litige, supprimé) perd sa ligne miroir ET les
// lignes d'historique de rating qui en découlaient.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import {
  snapshotMatchParticipants,
  applyMatchRatingIncremental,
} from '@/utils/rating/applyMatchRating';

type ScrimRow = {
  id: string;
  name: string | null;
  status: string;
  ranked: boolean | null;
  deleted_at: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  scheduled_date: string | null;
  completed_at: string | null;
  stream_url: string | null;
};

const SCRIM_COLUMNS =
  'id, name, status, ranked, deleted_at, team1_id, team2_id, team1_score, team2_score, winner_team_id, scheduled_date, completed_at, stream_url';

/**
 * Un scrim mérite-t-il une ligne `matches` notée ?
 *
 * PUR — c'est la règle, isolée de l'I/O pour être testable et pour qu'il n'en
 * existe qu'une seule formulation.
 *
 * Le match nul est volontairement exclu : le moteur Glicko-2 du projet ne note
 * qu'un vainqueur et un perdant (cf. `applyMatchToStates`). Un scrim nul reste
 * un résultat valide au ladder, il ne produit simplement pas de rating.
 */
export function isScrimRatable(scrim: {
  status: string;
  ranked?: boolean | null;
  deleted_at?: string | null;
  team1_id?: string | null;
  team2_id?: string | null;
  winner_team_id?: string | null;
}): boolean {
  if (scrim.deleted_at) return false;
  if (scrim.status !== 'completed') return false;
  if (scrim.ranked === false) return false;
  if (!scrim.team1_id || !scrim.team2_id) return false;
  if (!scrim.winner_team_id) return false;
  return true;
}

/** Supprime le miroir d'un scrim et l'historique de rating qui en découle. */
async function dropMirror(tenantId: string, matchId: string): Promise<void> {
  if (!supabaseAdmin) return;
  // L'historique d'abord : sans lui, la joueuse garderait les points d'une
  // partie qui n'existe plus. `match_participants` part en cascade avec le
  // match (FK ON DELETE CASCADE).
  const { error: histErr } = await supabaseAdmin
    .from('player_rating_history')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('match_id', matchId);
  if (histErr) {
    logger.error('[scrim-rating] history delete error', histErr);
    return;
  }
  const { error: delErr } = await supabaseAdmin
    .from('matches')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', matchId);
  if (delErr) logger.error('[scrim-rating] mirror delete error', delErr);
}

/**
 * Aligne le miroir `matches` d'un scrim sur son état courant, puis note la
 * partie. Best-effort : loggue et ne throw JAMAIS — un scrim dont le résultat
 * est déjà persisté ne doit pas échouer parce que le rating a hoqueté.
 *
 * Idempotent : rappelée sur le même scrim, elle met à jour la même ligne, et
 * `applyMatchRatingIncremental` ne recompte pas un match déjà noté.
 */
export async function syncScrimRatedMatch(
  tenantId: string,
  scrimId: string
): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    const { data: scrimRow, error: scrimErr } = await supabaseAdmin
      .from('scrims')
      .select(SCRIM_COLUMNS)
      .eq('tenant_id', tenantId)
      .eq('id', scrimId)
      .maybeSingle();
    if (scrimErr) {
      logger.error('[scrim-rating] scrim read error', scrimErr);
      return;
    }

    // Miroir existant, s'il y en a un.
    const { data: existing, error: exErr } = await supabaseAdmin
      .from('matches')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('scrim_id', scrimId)
      .maybeSingle();
    if (exErr) {
      logger.error('[scrim-rating] mirror read error', exErr);
      return;
    }
    const existingId = (existing as { id?: string } | null)?.id ?? null;

    const scrim = scrimRow as ScrimRow | null;
    if (!scrim || !isScrimRatable(scrim)) {
      if (existingId) await dropMirror(tenantId, existingId);
      return;
    }

    const payload = {
      tenant_id: tenantId,
      scrim_id: scrim.id,
      tournament_id: null,
      team1_id: scrim.team1_id,
      team2_id: scrim.team2_id,
      team1_score: scrim.team1_score,
      team2_score: scrim.team2_score,
      winner_team_id: scrim.winner_team_id,
      status: 'finished',
      is_bye: false,
      round_name: scrim.name ?? 'Scrim',
      scheduled_at: scrim.scheduled_date,
      completed_at: scrim.completed_at ?? scrim.scheduled_date,
      stream_url: scrim.stream_url,
      updated_at: new Date().toISOString(),
    };

    let matchId = existingId;
    if (matchId) {
      const { error: updErr } = await supabaseAdmin
        .from('matches')
        .update(payload)
        .eq('tenant_id', tenantId)
        .eq('id', matchId);
      if (updErr) {
        logger.error('[scrim-rating] mirror update error', updErr);
        return;
      }
    } else {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from('matches')
        .insert(payload)
        .select('id')
        .maybeSingle();
      if (insErr || !inserted) {
        logger.error('[scrim-rating] mirror insert error', insErr);
        return;
      }
      matchId = (inserted as { id: string }).id;
    }

    await snapshotMatchParticipants(tenantId, {
      id: matchId,
      tournament_id: null,
      team1_id: scrim.team1_id,
      team2_id: scrim.team2_id,
    });
    await applyMatchRatingIncremental(tenantId, matchId);
  } catch (err) {
    logger.error('[scrim-rating] syncScrimRatedMatch exception', err);
  }
}
