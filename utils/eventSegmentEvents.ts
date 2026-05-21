// utils/eventSegmentEvents.ts
//
// Helper d'emission de l'event bot `event_segment.transitioned`.
//
// Pourquoi un helper dedie plutot que `emitBotEvent()` ?
//   - `BotEventName` union type est restreint et controle explicitement
//     (cf. utils/botEvents.ts). On ne veut pas l'elargir tant que le contrat
//     bot n'est pas figé — `event_segment.transitioned` reste un event
//     "interne" cote outbox tant que le bot ne le consomme pas activement.
//   - `bot_event_outbox.event_name` est `text` libre (cf.
//     extend_bot_event_outbox_segment_transition.sql) — aucune contrainte DB
//     a respecter, on ecrit directement.
//   - On bypass volontairement le push HTTP : pour le Lot 2, on ne pousse pas
//     en realtime au bot. Le bot poll deja `/api/bot/v1/events/pending` et
//     recuperera ces rows de la meme maniere que les autres events.
//
// Shape du payload (consomme par le bot via outbox.pending) :
//
// {
//   id: <event_id>,            // uuid v4
//   event: 'event_segment.transitioned',
//   tenantId: <uuid>,
//   timestamp: <iso>,
//   data: {
//     runId: <uuid>,
//     segmentId: <uuid>,
//     fromStatus: 'upcoming' | 'live' | <other>,
//     toStatus: 'live' | 'done' | 'skipped',
//     tenantId: <uuid>,
//     broadcastMessage: <jsonb | null>,
//     segment: {
//       ord, type, title, durationMin, matchId
//     }
//   }
// }

import crypto from 'crypto';
import { supabaseAdmin } from './supabase';
import { logger } from './logger';

export type SegmentTransitionPayload = {
  runId: string;
  segmentId: string;
  fromStatus: string;
  toStatus: 'live' | 'done' | 'skipped';
  tenantId: string;
  broadcastMessage: unknown | null;
  segment: {
    ord: number;
    type: string;
    title: string;
    durationMin: number | null;
    matchId: string | null;
  };
};

const EVENT_NAME = 'event_segment.transitioned';

export async function emitSegmentTransitioned(
  data: SegmentTransitionPayload
): Promise<void> {
  if (!supabaseAdmin) {
    logger.warn(
      '[eventSegmentEvents] supabaseAdmin unavailable, skipping outbox write'
    );
    return;
  }

  const eventId = crypto.randomUUID();
  const fullPayload = {
    id: eventId,
    event: EVENT_NAME,
    tenantId: data.tenantId,
    timestamp: new Date().toISOString(),
    data: {
      runId: data.runId,
      segmentId: data.segmentId,
      fromStatus: data.fromStatus,
      toStatus: data.toStatus,
      tenantId: data.tenantId,
      broadcastMessage: data.broadcastMessage ?? null,
      segment: data.segment,
    },
  };

  const { error } = await supabaseAdmin.from('bot_event_outbox').insert({
    event_id: eventId,
    event_name: EVENT_NAME,
    tenant_id: data.tenantId,
    payload: fullPayload,
    status: 'pending',
  });

  if (error) {
    logger.error('[eventSegmentEvents] outbox insert error', error);
  }
}
