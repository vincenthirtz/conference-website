// utils/dashboard/alertsSignals.ts
// Chemin de données LÉGER pour le badge d'alertes de la navbar admin.
//
// Le badge (components/Navbar/AdminTopBar.tsx) est présent sur TOUTES les pages
// /admin/*, pollé ~toutes les 60 s + realtime. Il n'a besoin que des 8
// compteurs de `AlertsSummary`. Le builder complet `fetchDashboardData`
// exécute ~18 requêtes DB (veto, webhooks, staff_logs, ticket breakdown,
// enrichissement noms/live, réglages stages, heartbeat cron…) pour finalement
// jeter 99 % du payload.
//
// Ici on ne charge QUE le strict nécessaire (6 requêtes) et on réutilise les
// MÊMES helpers de calcul purs que le builder (computeScheduleConflicts,
// computeCheckin24h, computeRosterLockProximity, computeStagesReadyToAdvance)
// puis le MÊME agrégateur `summarizeAlerts`. La parité avec le dashboard est
// donc garantie par le code partagé, pas par duplication.

import { supabaseAdmin } from '../supabase';
import { isValidUUID } from '../apiHelpers';
import { DEFAULT_TENANT_ID } from '../tenant';
import { logger } from '../logger';
import {
  type AlertsSummary,
  computeScheduleConflicts,
  computeCheckin24h,
  computeRosterLockProximity,
  computeStagesReadyToAdvance,
  summarizeAlerts,
} from './buildTournamentDashboard';

export type AlertsSignalsResult =
  | { ok: true; summary: AlertsSummary }
  | { ok: false; status: 400 | 404 | 500; error: string };

/**
 * Colonnes matchs réellement lues par les 4 signaux calculés (disputes,
 * conflits, check-in 24h, stages ready). Bien plus étroit que le SELECT du
 * builder (qui charge aussi scores, veto pointers, winner, completed_at,
 * round/stream…).
 */
const MATCH_COLUMNS =
  'id, stage_id, status, scheduled_at, is_bye, match_format, team1_id, team2_id, forfeit_processed_at, team1_checked_in_at, team2_checked_in_at';

/**
 * Produit un `AlertsSummary` strictement identique à
 * `computeAlertsSummary(fetchDashboardData(...).data)` en ne chargeant que le
 * minimum. 6 requêtes au lieu de ~18.
 */
export async function fetchAlertsSignals(
  tournamentId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<AlertsSignalsResult> {
  if (!tournamentId || !isValidUUID(tournamentId)) {
    return { ok: false, status: 400, error: 'Invalid tournament id' };
  }

  if (!supabaseAdmin) {
    return {
      ok: false,
      status: 500,
      error: 'Database service unavailable (missing service role).',
    };
  }

  try {
    // 1. Tournoi — on ne lit que ce dont dépend le badge : roster_locked_at
    //    (pour rosterLockSoon). Sert aussi de garde 404.
    const { data: tournament, error: tErr } = await supabaseAdmin
      .from('tournaments')
      .select('id, roster_locked_at')
      .eq('id', tournamentId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (tErr || !tournament) {
      return { ok: false, status: 404, error: 'Tournament not found' };
    }

    // 2-6. Le reste en parallèle : stages (pour stagesReady), matchs (colonnes
    //      minimales pour disputes/conflits/checkin/stagesReady) + 3 cheap
    //      counts (pendingTeams, supportHigh, activeMvpPolls). Les requêtes
    //      count/mvp sont IDENTIQUES à celles du builder → parité garantie.
    const [stagesRes, matchesRes, pendingTeamsRes, supportHighRes, mvpRes] =
      await Promise.all([
        supabaseAdmin
          .from('tournament_stages')
          .select('id, name, is_active, settings')
          .eq('tournament_id', tournamentId)
          .eq('tenant_id', tenantId),
        supabaseAdmin
          .from('matches')
          .select(MATCH_COLUMNS)
          .eq('tournament_id', tournamentId)
          .eq('tenant_id', tenantId),
        supabaseAdmin
          .from('tournament_teams')
          .select('id', { count: 'exact', head: true })
          .eq('tournament_id', tournamentId)
          .eq('tenant_id', tenantId)
          .eq('status', 'pending'),
        supabaseAdmin
          .from('support_tickets')
          .select('id', { count: 'exact', head: true })
          .eq('tournament_id', tournamentId)
          .eq('severity', 'high')
          .eq('status', 'open'),
        supabaseAdmin
          .from('match_mvp_polls')
          .select('match_id, matches!inner(tournament_id)')
          .eq('tenant_id', tenantId)
          .is('winner_member_id', null)
          .eq('matches.tournament_id', tournamentId),
      ]);

    const stages = (stagesRes.data ?? []) as {
      id: string;
      name: string;
      is_active: boolean;
      settings?: unknown;
    }[];
    const matches = (matchesRes.data ?? []) as {
      id: string;
      stage_id: string | null;
      status: string | null;
      scheduled_at: string | null;
      is_bye: boolean | null;
      match_format: string | null;
      team1_id: string | null;
      team2_id: string | null;
      forfeit_processed_at: string | null;
      team1_checked_in_at: string | null;
      team2_checked_in_at: string | null;
    }[];

    const nowMs = Date.now();

    // Signaux calculés — via les helpers PURS partagés avec le builder.
    const disputes = matches.filter((m) => m.status === 'disputed').length;
    const conflicts = computeScheduleConflicts(matches).count;
    const checkin = computeCheckin24h(matches, nowMs);
    const rosterLock = computeRosterLockProximity({
      rosterLockedAt: tournament.roster_locked_at ?? null,
      // teamsBelowMin n'est pas consommé par le badge : on n'a donc pas besoin
      // de charger team_members. Seuls lockedAt + hoursLeft comptent ici.
      minPlayers: null,
      nowMs,
      registeredTeamIds: [],
      memberRows: [],
    });
    const stagesReady = computeStagesReadyToAdvance(stages, matches);

    const summary = summarizeAlerts({
      tournamentId: tournament.id,
      disputes,
      conflicts,
      supportHigh: supportHighRes.count ?? 0,
      pendingTeams: pendingTeamsRes.count ?? 0,
      checkinMissing: checkin.missing,
      rosterLockedAt: rosterLock.lockedAt,
      rosterHoursLeft: rosterLock.hoursLeft,
      stagesReady: stagesReady.length,
      activeMvpPolls: mvpRes.data?.length ?? 0,
    });

    return { ok: true, summary };
  } catch (err: unknown) {
    logger.error('[fetchAlertsSignals] error:', err);
    return { ok: false, status: 500, error: 'Internal server error' };
  }
}
