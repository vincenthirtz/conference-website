// utils/scrimEvents.ts
//
// Helper d'emit des bot events liés au cycle de vie d'un scrim. Résout les
// noms / short_name d'équipes pour enrichir le payload, puis délègue à
// emitBotEvent (insertion outbox + push HMAC).
//
// Le bot consomme ces events depuis bot_event_outbox / webhook ; il pourra
// par exemple annoncer un scrim qui démarre, ouvrir un thread dédié ou
// notifier les capitaines en DM.

import { supabaseAdmin } from './supabase';
import { logger } from './logger';
import { emitBotEvent, type BotEventName } from './botEvents';

type ScrimEventName = Extract<BotEventName, `scrim.${string}`>;

type ScrimRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  team1_id: string | null;
  team2_id: string | null;
  scheduled_date: string | null;
  timezone: string | null;
  is_public: boolean | null;
  stream_url: string | null;
  description: string | null;
  source_demande_id: string | null;
};

type TeamLite = {
  id: string;
  name: string;
  short_name: string | null;
};

async function resolveTeams(
  team1Id: string | null,
  team2Id: string | null
): Promise<{ team1: TeamLite | null; team2: TeamLite | null }> {
  if (!supabaseAdmin) return { team1: null, team2: null };
  const ids = [team1Id, team2Id].filter((x): x is string => !!x);
  if (ids.length === 0) return { team1: null, team2: null };

  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('id, name, short_name')
    .in('id', ids);
  if (error) {
    logger.error('[scrimEvents] resolveTeams error', error);
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
    team1: team1Id ? (byId.get(team1Id) ?? null) : null,
    team2: team2Id ? (byId.get(team2Id) ?? null) : null,
  };
}

/**
 * Émet un bot event scrim.* avec un payload normalisé.
 *
 * Appel non-bloquant côté caller : utilise `void emitScrimEvent(...)` ou
 * `.catch(noop)` — toute erreur est déjà loggée en interne et n'a aucun
 * effet sur la réponse HTTP de la route.
 */
export async function emitScrimEvent(
  eventName: ScrimEventName,
  scrim: ScrimRow,
  extras?: Record<string, unknown>
): Promise<void> {
  try {
    const { team1, team2 } = await resolveTeams(scrim.team1_id, scrim.team2_id);
    await emitBotEvent(eventName, {
      scrimId: scrim.id,
      name: scrim.name,
      slug: scrim.slug,
      status: scrim.status,
      team1,
      team2,
      scheduledDate: scrim.scheduled_date,
      timezone: scrim.timezone,
      isPublic: scrim.is_public,
      streamUrl: scrim.stream_url,
      description: scrim.description,
      sourceDemandeId: scrim.source_demande_id,
      ...(extras ?? {}),
    });
  } catch (err) {
    logger.error(`[scrimEvents] emit ${eventName} failed`, err);
  }
}

/**
 * Détermine l'event à émettre pour une transition de status. Retourne null
 * si le status n'a pas changé ou si la transition n'a pas de mapping
 * (ex: scheduled → draft = retour arrière, on n'émet rien pour éviter le
 * bruit côté bot ; le PATCH reste audité par staff_logs).
 */
export function statusTransitionEvent(
  beforeStatus: string,
  afterStatus: string
): ScrimEventName | null {
  if (beforeStatus === afterStatus) return null;
  switch (afterStatus) {
    case 'scheduled':
      // Émet uniquement si on entre dans 'scheduled' depuis draft.
      return beforeStatus === 'draft' ? 'scrim.scheduled' : null;
    case 'running':
      return 'scrim.starting';
    case 'completed':
      return 'scrim.finished';
    case 'cancelled':
      return 'scrim.cancelled';
    default:
      return null;
  }
}
