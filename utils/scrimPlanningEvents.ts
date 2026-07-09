// utils/scrimPlanningEvents.ts
//
// Emit des bot events liés au cycle de vie d'une SESSION de planning de scrim
// (grille de dispos partagée). Distinct de utils/scrimEvents.ts : un planning
// n'est PAS un scrim (pas de ScrimRow), donc on ne peut pas passer par
// emitScrimEvent. On résout juste les noms d'équipes et on délègue à
// emitBotEvent (outbox + push HMAC), exactement comme scrimEvents.
//
// Events couverts :
//   - scrim.planning.opened     : une session est ouverte entre 2 équipes.
//   - scrim.planning.validated  : l'admin a validé un créneau → un scrims est
//                                 créé (l'event scrim.scheduled est émis à part
//                                 par la route de validation via emitScrimEvent).

import { supabaseAdmin } from './supabase';
import { logger } from './logger';
import { emitBotEvent, type BotEventName } from './botEvents';

type ScrimPlanningEventName = Extract<
  BotEventName,
  `scrim.planning.${string}`
>;

type PlanningRow = {
  id: string;
  team1_id: string;
  team2_id: string;
  title: string | null;
  game: string | null;
  status: string;
  horizon_start: string;
  horizon_days: number;
  validated_slot: string | null;
  scrim_id: string | null;
  tenant_id?: string | null;
};

type TeamLite = {
  id: string;
  name: string;
  short_name: string | null;
};

async function resolveTeams(
  team1Id: string,
  team2Id: string
): Promise<{ team1: TeamLite | null; team2: TeamLite | null }> {
  if (!supabaseAdmin) return { team1: null, team2: null };
  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('id, name, short_name')
    .in('id', [team1Id, team2Id]);
  if (error) {
    logger.error('[scrimPlanningEvents] resolveTeams error', error);
    return { team1: null, team2: null };
  }
  const byId = new Map<string, TeamLite>(
    (data ?? []).map((t) => [
      t.id as string,
      {
        id: t.id as string,
        name: t.name as string,
        short_name: (t.short_name as string | null) ?? null,
      },
    ])
  );
  return {
    team1: byId.get(team1Id) ?? null,
    team2: byId.get(team2Id) ?? null,
  };
}

/**
 * Émet un bot event scrim.planning.* avec un payload normalisé.
 *
 * Appel non-bloquant côté caller (`void emitScrimPlanningEvent(...)`) : toute
 * erreur est loggée en interne et n'affecte pas la réponse HTTP.
 */
export async function emitScrimPlanningEvent(
  eventName: ScrimPlanningEventName,
  planning: PlanningRow,
  tenantId: string,
  extras?: Record<string, unknown>
): Promise<void> {
  try {
    const resolvedTenantId = tenantId || planning.tenant_id || null;
    if (!resolvedTenantId) {
      logger.error(
        `[scrimPlanningEvents] ${eventName} aborted: tenantId missing — multi-tenant required`
      );
      return;
    }
    const { team1, team2 } = await resolveTeams(
      planning.team1_id,
      planning.team2_id
    );
    await emitBotEvent(
      eventName,
      {
        planningId: planning.id,
        title: planning.title,
        game: planning.game,
        status: planning.status,
        team1,
        team2,
        horizonStart: planning.horizon_start,
        horizonDays: planning.horizon_days,
        validatedSlot: planning.validated_slot,
        scrimId: planning.scrim_id,
        ...(extras ?? {}),
      },
      resolvedTenantId
    );
  } catch (err) {
    logger.error(`[scrimPlanningEvents] emit ${eventName} failed`, err);
  }
}
