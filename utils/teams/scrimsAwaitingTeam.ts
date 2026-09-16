// utils/teams/scrimsAwaitingTeam.ts
//
// « Quels scrims attendent la réponse de CETTE équipe ? » — UNE règle, deux
// lecteurs : le tableau de bord (`/api/player/dashboard`, bloc « scrims qui
// attendent ta réponse » + bandeau « à faire ») et la cloche
// (`/api/player/notifications`, compteur `pendingScrims`).
//
// POURQUOI UN MODULE. La cloche comptait TOUTES les demandes de scrim en attente
// adressées à l'équipe (`team_id`), y compris celles où la balle était dans le
// camp adverse après une contre-proposition, et ignorait celles où l'équipe
// était demandeuse et devait répondre à un contre. Le tableau de bord, lui,
// appliquait la règle juste. Résultat : un « 1 » sur la cloche, rien sur le
// tableau de bord — un badge fantôme qu'on ne peut pas faire disparaître.
//
// La règle :
//   - l'équipe PARTICIPE à la demande, dans un sens ou dans l'autre — cible
//     (`team_id`) ou demandeuse (`payload.from_team_id`) ;
//   - la proposition en cours n'a PAS été faite par elle (`scrim_nego.proposed_by`,
//     lu via `readScrimNego`, qui retombe sur `from_team_id` pour les demandes
//     d'avant la négociation) : c'est son tour.
//
// Deux requêtes (une par sens) fusionnées en code plutôt qu'un `.or()` sur un
// chemin JSON : c'est la forme éprouvée du tableau de bord, et le mock de test
// ne sait pas filtrer ce `.or()`-là.

import { supabaseAdmin } from '@/utils/supabase';
import { readScrimNego } from '@/utils/teams/scrimNegotiation';

/** Colonnes dont les deux lecteurs ont besoin — pas de `select('*')`. */
const SCRIM_DEMANDE_COLUMNS =
  'id, team_id, user_id, source, status, comment, payload, created_at';

export type ScrimDemandeRow = {
  id: string;
  team_id: string | null;
  user_id: string | null;
  source: string | null;
  status: string;
  comment: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

/**
 * Prédicat pur : c'est au tour de `teamId` de répondre à cette demande.
 * Suppose la participation déjà établie par la requête.
 */
export function isTeamsTurn(
  row: { payload?: Record<string, unknown> | null },
  teamId: string
): boolean {
  const nego = readScrimNego(row.payload || {});
  return nego.proposed_by !== teamId;
}

/**
 * Demandes de scrim `pending` où c'est au tour de l'équipe, dédoublonnées.
 * Lève en cas d'erreur de lecture : chaque appelant
 * décide de sa dégradation (liste vide, compteur à zéro).
 */
export async function loadScrimsAwaitingTeam(
  teamId: string,
  tenantId: string
): Promise<ScrimDemandeRow[]> {
  const [asTargetRes, asRequesterRes] = await Promise.all([
    supabaseAdmin
      .from('demandes')
      .select(SCRIM_DEMANDE_COLUMNS)
      .eq('team_id', teamId)
      .eq('tenant_id', tenantId)
      .eq('type', 'scrim')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('demandes')
      .select(SCRIM_DEMANDE_COLUMNS)
      .filter('payload->>from_team_id', 'eq', teamId)
      .eq('tenant_id', tenantId)
      .eq('type', 'scrim')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  ]);

  const readError = asTargetRes.error || asRequesterRes.error;
  if (readError) throw readError;

  const byId = new Map<string, ScrimDemandeRow>();
  for (const d of [
    ...((asTargetRes.data || []) as unknown as ScrimDemandeRow[]),
    ...((asRequesterRes.data || []) as unknown as ScrimDemandeRow[]),
  ]) {
    byId.set(d.id, d);
  }

  // Ordre conservé tel que le tableau de bord l'affichait déjà : demandes
  // reçues puis demandes émises, chacune de la plus récente à la plus ancienne.
  return Array.from(byId.values()).filter((d) => isTeamsTurn(d, teamId));
}
