// features/player/notifications/service/prefs.ts — préférences de
// notification PAR CANAL de la joueuse (lot P15). Extrait tel quel de la
// route historique.
//
//   - push  : catalogue PLAYER_PUSH_EVENT_TYPES, OPT-OUT (absent = true) ; le
//             dispatcher Web Push n'écarte que sur un opt-out explicite ;
//   - email : catalogue EMAIL_EVENT_TYPES, OPT-IN (absent = false) ; le
//             digest n'envoie que sur une ligne enabled=true ;
//   - (`broadcast`, `email`) : OPT-OUT (abonnée par défaut), posé par la
//             désinscription RGPD et relu par utils/broadcasts. Exposé à part
//             (`broadcastEmail`), sans toucher aux deux cartes.
// Une ligne n'existe que pour un état NON-DÉFAUT ; revenir au défaut = la
// supprimer.

import { LegacyAdminError } from '@/utils/admin/errors';
import { parseBody } from '@/utils/player/errors';
import {
  BROADCAST_OPT_OUT_EVENT_TYPE,
  EMAIL_EVENT_TYPES,
  PLAYER_PUSH_EVENT_TYPES,
} from '@/utils/webPushEvents';
import * as repo from '../repository';
import type { PrefRow } from '../repository';
import {
  NotificationPrefPutBody,
  type NotificationChannel,
  type NotificationPrefs,
} from '../schemas';
import type { NotificationsCtx } from './context';

const CHANNEL_TYPES: Record<NotificationChannel, readonly string[]> = {
  push: PLAYER_PUSH_EVENT_TYPES,
  email: EMAIL_EVENT_TYPES,
};

const CHANNEL_DEFAULT: Record<NotificationChannel, boolean> = {
  push: true,
  email: false,
};

const serverError = () => new LegacyAdminError(500, 'Erreur serveur.');

function isBroadcastCombo(channel: NotificationChannel, eventType: string) {
  return channel === 'email' && eventType === BROADCAST_OPT_OUT_EVENT_TYPE;
}

/** Défaut d'un couple : broadcast = abonnée (true), sinon celui du canal. */
function defaultFor(channel: NotificationChannel, eventType: string): boolean {
  if (eventType === BROADCAST_OPT_OUT_EVENT_TYPE) return true;
  return CHANNEL_DEFAULT[channel];
}

function mergeChannel(
  rows: PrefRow[],
  channel: NotificationChannel
): Record<string, boolean> {
  const map = new Map<string, boolean>();
  for (const r of rows)
    if (r.channel === channel) map.set(r.event_type, r.enabled);
  const out: Record<string, boolean> = {};
  for (const eventType of CHANNEL_TYPES[channel]) {
    out[eventType] = map.get(eventType) ?? CHANNEL_DEFAULT[channel];
  }
  return out;
}

/** État exhaustif rendu par GET et PUT. */
export function buildPrefs(rows: PrefRow[]): NotificationPrefs {
  return {
    push: mergeChannel(rows, 'push'),
    email: mergeChannel(rows, 'email'),
    broadcastEmail: !rows.some(
      (r) =>
        r.channel === 'email' &&
        r.event_type === BROADCAST_OPT_OUT_EVENT_TYPE &&
        r.enabled === false
    ),
  };
}

async function loadPrefs(ctx: NotificationsCtx): Promise<NotificationPrefs> {
  const { rows, error } = await repo.listPrefRows(ctx.db, ctx.userId);
  if (error) {
    ctx.logger.error('[player/push/prefs] load error', error);
    throw serverError();
  }
  return buildPrefs(rows);
}

/** GET /api/player/push/prefs. */
export function readPrefs(ctx: NotificationsCtx) {
  return loadPrefs(ctx);
}

/** PUT /api/player/push/prefs — un interrupteur, puis l'état complet. */
export async function setPref(
  ctx: NotificationsCtx,
  rawBody: unknown
): Promise<NotificationPrefs> {
  const parsed = parseBody(NotificationPrefPutBody, rawBody, {
    message: 'Validation échouée.',
    code: 'INVALID_BODY',
  });
  if (!parsed.ok) {
    throw new LegacyAdminError(400, parsed.body.error, {
      code: parsed.body.code,
      extra: { fields: parsed.body.fields },
    });
  }
  const { eventType, channel, enabled } = parsed.data;

  if (
    !CHANNEL_TYPES[channel].includes(eventType) &&
    !isBroadcastCombo(channel, eventType)
  ) {
    throw new LegacyAdminError(
      400,
      `event_type "${eventType}" non autorisé pour le canal "${channel}".`,
      { code: 'INVALID_EVENT_TYPE' }
    );
  }

  const key = { userId: ctx.userId, eventType, channel };
  const del = await repo.deletePrefRow(ctx.db, key);
  if (del.error) {
    ctx.logger.error('[player/push/prefs] PUT delete error', del.error);
    throw serverError();
  }
  if (enabled !== defaultFor(channel, eventType)) {
    const ins = await repo.insertPrefRow(ctx.db, { ...key, enabled });
    if (ins.error) {
      ctx.logger.error('[player/push/prefs] PUT insert error', ins.error);
      throw serverError();
    }
  }
  return loadPrefs(ctx);
}
