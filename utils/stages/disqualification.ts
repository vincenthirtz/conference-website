// utils/stages/disqualification.ts
// Équipes disqualifiées d'une phase (`stage_teams.disqualified_at`, migration
// add_disqualification_to_stage_teams.sql) et leur effet sur un classement.
//
// Deux modes, choisis par le staff (features/admin/stages/service/disqualify):
//   - `forfeit` : ses matchs restants sont perdus par forfait ; TOUS ses
//     matchs comptent normalement pour tout le monde.
//   - `annul`   : ses matchs restants sont annulés ; TOUS ses matchs, quel que
//     soit leur statut, sont ignorés du classement de TOUTES les équipes.
// Dans les deux modes, l'équipe est classée APRÈS toutes les autres (ses
// propres chiffres restent affichés) et n'est jamais qualifiée.

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';

export const DISQUALIFICATION_MODES = ['forfeit', 'annul'] as const;
export type DisqualificationMode = (typeof DISQUALIFICATION_MODES)[number];

export type StageDisqualification = {
  teamId: string;
  mode: DisqualificationMode;
  disqualifiedAt: string;
  reason: string | null;
  /** Staff à l'origine de la décision (`staff.id`). */
  disqualifiedBy: string | null;
};

/** teamId → disqualification, pour UNE phase. */
export type DisqualificationMap = Map<string, StageDisqualification>;

type DisqualificationRow = {
  stage_id: string;
  team_id: string;
  disqualified_at: string | null;
  disqualification_mode: string | null;
  disqualification_reason: string | null;
  disqualified_by: string | null;
};

/** Mode lu en base ; une valeur inattendue retombe sur `forfeit` (le moins destructif). */
export function parseDisqualificationMode(
  value: unknown
): DisqualificationMode {
  return value === 'annul' ? 'annul' : 'forfeit';
}

/**
 * Disqualifications des phases demandées, par phase.
 *
 * Une lecture en échec (migration pas encore appliquée, panne) est
 * JOURNALISÉE et rend une carte vide : un classement sans disqualification
 * vaut mieux qu'une page de classement vide.
 */
export async function readStageDisqualifications(
  tenantId: string,
  stageIds: string[]
): Promise<Map<string, DisqualificationMap>> {
  if (!supabaseAdmin || stageIds.length === 0) return new Map();
  const { map, error } = await queryStageDisqualifications(tenantId, stageIds);
  if (error) {
    logger.warn('[standings] disqualifications illisibles:', error);
  }
  return map;
}

/**
 * Disqualifications d'UNE phase, SANS repli silencieux : `error` renseigné si
 * la lecture échoue. Pour les chemins qui ÉCRIVENT (génération d'une ronde
 * suisse) : ignorer une disqualification illisible y apparierait l'équipe.
 */
export async function readDisqualificationMapStrict(
  tenantId: string,
  stageId: string
): Promise<{ map: DisqualificationMap; error: string | null }> {
  const { map, error } = await queryStageDisqualifications(tenantId, [stageId]);
  return { map: map.get(stageId) ?? new Map(), error };
}

async function queryStageDisqualifications(
  tenantId: string,
  stageIds: string[]
): Promise<{ map: Map<string, DisqualificationMap>; error: string | null }> {
  const out = new Map<string, DisqualificationMap>();
  if (stageIds.length === 0) return { map: out, error: null };
  if (!supabaseAdmin) return { map: out, error: 'Service indisponible.' };

  const { data, error } = await supabaseAdmin
    .from('stage_teams')
    .select(
      'stage_id, team_id, disqualified_at, disqualification_mode, disqualification_reason, disqualified_by'
    )
    .eq('tenant_id', tenantId)
    .in('stage_id', stageIds)
    .not('disqualified_at', 'is', null);

  if (error) return { map: out, error: error.message };

  for (const row of (data ?? []) as DisqualificationRow[]) {
    if (!row.disqualified_at) continue;
    const map = out.get(row.stage_id) ?? new Map();
    map.set(row.team_id, {
      teamId: row.team_id,
      mode: parseDisqualificationMode(row.disqualification_mode),
      disqualifiedAt: row.disqualified_at,
      reason: row.disqualification_reason ?? null,
      disqualifiedBy: row.disqualified_by ?? null,
    });
    out.set(row.stage_id, map);
  }
  return { map: out, error: null };
}

/** Disqualifications d'UNE phase. */
export async function readDisqualificationMap(
  tenantId: string,
  stageId: string
): Promise<DisqualificationMap> {
  const all = await readStageDisqualifications(tenantId, [stageId]);
  return all.get(stageId) ?? new Map();
}

/**
 * Retire les matchs impliquant une équipe disqualifiée en mode `annul`.
 * PURE. Les matchs d'une équipe en mode `forfeit` restent.
 */
export function excludeAnnulledMatches<
  M extends { team1_id: string | null; team2_id: string | null },
>(matches: M[], dq: DisqualificationMap): M[] {
  if (dq.size === 0) return matches;
  const annulled = new Set(
    [...dq.values()].filter((d) => d.mode === 'annul').map((d) => d.teamId)
  );
  if (annulled.size === 0) return matches;
  return matches.filter(
    (m) =>
      !(m.team1_id && annulled.has(m.team1_id)) &&
      !(m.team2_id && annulled.has(m.team2_id))
  );
}

/**
 * Classe les équipes disqualifiées après toutes les autres (ordre relatif
 * conservé de part et d'autre), renumérote les rangs et marque les lignes
 * disqualifiées. PURE.
 */
export function demoteDisqualified<T extends { teamId: string; rank: number }>(
  standings: T[],
  dq: DisqualificationMap
): (T & {
  disqualified?: boolean;
  disqualificationMode?: DisqualificationMode;
})[] {
  if (dq.size === 0) return standings;
  const kept = standings.filter((s) => !dq.has(s.teamId));
  const out = standings
    .filter((s) => dq.has(s.teamId))
    .map((s) => ({
      ...s,
      disqualified: true as const,
      disqualificationMode: dq.get(s.teamId)!.mode,
    }));
  return [...kept, ...out].map((s, i) => ({ ...s, rank: i + 1 }));
}
