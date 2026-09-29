// features/admin/matches/repository/disputesBoard.ts — requêtes du tableau
// des litiges : `matches` du tenant en `disputed`, filtres SLA en base.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminDb } from '@/utils/admin/serviceContext';
import type { SLAClassification } from '@/utils/disputes/slaBreaches';

// Seulement ce que la page affiche / trie. Relations résolues par FK.
export const DISPUTE_BOARD_COLUMNS = `
  id,
  tournament_id,
  team1_id,
  team2_id,
  dispute_reason,
  dispute_opened_at,
  escalation_pinged_at,
  team1:teams!matches_team1_fk(id, name),
  team2:teams!matches_team2_fk(id, name),
  tournament:tournaments(id, name, slug)
`;

export type DisputeQueryBase = {
  tenantId: string;
  tournamentId: string | null;
  status: SLAClassification | null;
  slaMinutes: number;
  nowMs: number;
};

/**
 * Fenêtre `dispute_opened_at` d'une classification SLA (filtre en base) :
 *   breached    : âge >= SLA            → opened_at <= now - SLA
 *   approaching : 0.75*SLA <= âge < SLA → now - SLA < opened_at <= now - 0.75*SLA
 *   fresh       : âge < 0.75*SLA        → opened_at > now - 0.75*SLA (ou NULL)
 */
export function classificationWindow(
  cls: SLAClassification,
  slaMinutes: number,
  nowMs: number
): { breachedBefore?: string; approachBefore?: string } {
  const minToMs = (m: number) => m * 60_000;
  const breachedBefore = new Date(nowMs - minToMs(slaMinutes)).toISOString();
  const approachBefore = new Date(
    nowMs - minToMs(slaMinutes * 0.75)
  ).toISOString();
  if (cls === 'breached') return { breachedBefore };
  if (cls === 'approaching') return { breachedBefore, approachBefore };
  return { approachBefore };
}

// Les builders PostgREST se réassignent au fil des filtres ; le type généré
// ne suit pas — typé large dans ce seul helper.
type FilterBuilder = any;

/** Requête de base (tenant + `disputed`) + filtres partagés liste / comptes. */
export function buildFilteredQuery(
  db: AdminDb,
  select: string,
  base: DisputeQueryBase,
  opts: { count?: 'exact'; head?: boolean } = {}
): FilterBuilder {
  let query: FilterBuilder = (db as unknown as SupabaseClient)
    .from('matches')
    .select(select, { count: opts.count, head: opts.head })
    .eq('tenant_id', base.tenantId)
    .eq('status', 'disputed');

  if (base.tournamentId) query = query.eq('tournament_id', base.tournamentId);

  if (base.status) {
    const w = classificationWindow(base.status, base.slaMinutes, base.nowMs);
    if (base.status === 'breached') {
      query = query.lte('dispute_opened_at', w.breachedBefore!);
    } else if (base.status === 'approaching') {
      query = query
        .gt('dispute_opened_at', w.breachedBefore!)
        .lte('dispute_opened_at', w.approachBefore!);
    } else {
      // fresh : ouvert récemment OU sans date d'ouverture.
      query = query.or(
        `dispute_opened_at.gt.${w.approachBefore!},dispute_opened_at.is.null`
      );
    }
  }
  return query;
}
