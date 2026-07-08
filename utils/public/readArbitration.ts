// utils/public/readArbitration.ts
//
// Chargement des métriques d'arbitrage AGRÉGÉES (non-nominatives) d'un tournoi
// pour l'API publique `/api/public/v1/tournaments/{id}/arbitration`.
//
// On projette UNIQUEMENT les champs dispute des matchs (status + timestamps
// opened/resolved) — jamais team/reason/id de match/joueur — puis on délègue
// l'agrégation à `computeArbitrationMetrics` (util pur, déterministe). La sortie
// ne contient QUE des nombres : aucun PII possible.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { getSlaMinutes } from '@/utils/disputes/slaBreaches';
import {
  computeArbitrationMetrics,
  type ArbitrationMatchRow,
  type ArbitrationMetrics,
} from '@/utils/disputes/arbitrationMetrics';

/**
 * Charge les lignes dispute d'un tournoi (scopées tenant), lit le SLA du tenant
 * et renvoie l'agrégat non-nominatif. `nowMs` injecté pour rester déterministe /
 * testable.
 */
export async function readTournamentArbitrationMetrics(
  tournamentId: string,
  tenantId: string,
  nowMs: number = Date.now()
): Promise<ArbitrationMetrics> {
  const { data, error } = await supabaseAdmin
    .from('matches')
    .select('status, dispute_opened_at, dispute_resolved_at')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId);

  if (error) {
    logger.error('[readTournamentArbitrationMetrics] matches error', error);
    throw new Error('Failed to load arbitration metrics');
  }

  const slaMinutes = await getSlaMinutes(tenantId);
  const rows = (data ?? []) as ArbitrationMatchRow[];
  return computeArbitrationMetrics(rows, slaMinutes, nowMs);
}
