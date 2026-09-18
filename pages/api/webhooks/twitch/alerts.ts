// POST /api/webhooks/twitch/alerts — les events Twitch de la boîte d'alertes.
//
// POURQUOI UN WEBHOOK, ALORS QUE L'EVENTSUB DU COCKPIT EXISTE DÉJÀ. Celui-là
// est en transport WEBSOCKET : c'est l'onglet staff qui ouvre la socket avec sa
// session, et les events n'existent que dans cette page. Une source OBS n'a
// aucune session — et une régie ne va pas garder un onglet d'admin ouvert pour
// que ses alertes marchent. Le transport webhook déplace la réception côté
// serveur, où elle survit à tout.
//
// MÊME FORME QUE LES DONS : webhook → table → poll public. Les deux flux de la
// boîte d'alertes arrivent donc par le même chemin, et se lisent par le même.
//
// CE QUE CETTE ROUTE NE FAIT PAS : elle n'affiche rien et ne décide rien. Elle
// authentifie, normalise (`utils/twitch/alertEventMapping.ts`) et dépose. Ce
// qu'on annonce, dans quel ordre et avec quelle phrase se décide à la lecture
// (`utils/overlay/alertBox.ts`) — pour qu'un changement de réglage s'applique
// sans avoir à rejouer l'historique.
//
// ACQUITTER LARGEMENT, REFUSER ÉTROITEMENT. Tout ce qui est signé mais
// inexploitable (type inconnu, chaîne non connectée, sub offert en double)
// repart en 200 : un échec ferait retenter Twitch, puis DÉSACTIVER la
// souscription — et personne ne s'en apercevrait avant le direct suivant. Seuls
// une signature invalide, un message périmé ou une panne de base méritent autre
// chose.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import {
  EVENTSUB_SECRET_ENV,
  verifyEventSubRequest,
} from '@/utils/twitch/eventsubRequest';
import {
  mapAlertEvent,
  readBroadcasterId,
} from '@/utils/twitch/alertEventMapping';

/** Le corps doit rester brut : la signature couvre les octets reçus. */
export const config = { api: { bodyParser: false } };

/** Poignée de main d'activation : Twitch veut son `challenge` en texte brut. */
const VerificationSchema = z.object({
  challenge: z.string().min(1),
  subscription: z.object({ type: z.string() }).partial().optional(),
});

const NotificationSchema = z.object({
  subscription: z.object({ type: z.string().min(1) }),
  event: z.record(z.string(), z.unknown()).nullable().optional(),
});

const RevocationSchema = z.object({
  subscription: z
    .object({ type: z.string(), status: z.string() })
    .partial()
    .optional(),
});

/**
 * L'espace propriétaire de la chaîne visée.
 *
 * `undefined` = lecture en échec (on demande un réessai), `null` = chaîne
 * qu'aucun espace n'a connectée (on acquitte). Confondre les deux ferait
 * perdre des alertes en silence pendant une panne de base.
 */
async function resolveTenantForBroadcaster(
  broadcasterId: string
): Promise<string | null | undefined> {
  if (!supabaseAdmin) return undefined;
  const { data, error } = await supabaseAdmin
    .from('twitch_broadcaster_connections')
    .select('tenant_id')
    .eq('broadcaster_id', broadcasterId)
    .maybeSingle();

  if (error) {
    logger.error(
      '[twitch/alerts] chaîne illisible: %s',
      (error as { message?: string }).message ?? String(error)
    );
    return undefined;
  }
  if (!data) return null;
  const tenantId = (data as { tenant_id?: unknown }).tenant_id;
  return typeof tenantId === 'string' && tenantId.length > 0
    ? tenantId
    : undefined;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res
      .status(405)
      .json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }

  const verified = await verifyEventSubRequest(req, {
    secret: process.env[EVENTSUB_SECRET_ENV],
  });
  if (!verified.ok) {
    if (verified.code === 'WEBHOOK_NOT_CONFIGURED') {
      logger.warn(
        `[twitch/alerts] secret absent — livraison refusée (définir ${EVENTSUB_SECRET_ENV})`
      );
    } else if (
      verified.code === 'INVALID_SIGNATURE' ||
      verified.code === 'STALE_MESSAGE'
    ) {
      logger.warn('[twitch/alerts] livraison refusée: %s', verified.code);
    }
    return res
      .status(verified.status)
      .json({ error: verified.error, code: verified.code });
  }

  // Signé mais d'un type que Twitch a ajouté depuis : on acquitte.
  if (verified.messageType === null) {
    return res.status(200).json({ ok: true, status: 'ignored_message_type' });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(verified.rawBody.toString('utf8'));
  } catch {
    return res
      .status(400)
      .json({ error: 'Invalid JSON', code: 'INVALID_JSON' });
  }

  // ── Activation ─────────────────────────────────────────────────────────
  if (verified.messageType === 'webhook_callback_verification') {
    const parsed = VerificationSchema.safeParse(payload);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid challenge', code: 'INVALID_CHALLENGE' });
    }
    // TEL QUEL, en texte brut : Twitch n'active pas la souscription sinon.
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send(parsed.data.challenge);
  }

  // ── Révocation ─────────────────────────────────────────────────────────
  if (verified.messageType === 'revocation') {
    const parsed = RevocationSchema.safeParse(payload);
    // Loggé fort : une souscription révoquée (token expiré, scope retiré,
    // chaîne bannie) éteint les alertes SANS erreur visible ailleurs.
    logger.warn(
      '[twitch/alerts] souscription révoquée: type=%s status=%s',
      parsed.success ? (parsed.data.subscription?.type ?? '?') : '?',
      parsed.success ? (parsed.data.subscription?.status ?? '?') : '?'
    );
    return res.status(200).json({ ok: true, status: 'revoked' });
  }

  // ── Notification ───────────────────────────────────────────────────────
  const parsed = NotificationSchema.safeParse(payload);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', code: 'INVALID_PAYLOAD' });
  }

  const subscriptionType = parsed.data.subscription.type;
  const event = parsed.data.event ?? null;

  const row = mapAlertEvent(subscriptionType, event);
  if (!row) {
    // Cas nominal : un sub OFFERT (déjà annoncé par le gift), ou un type
    // auquel cette route n'est pas abonnée.
    return res.status(200).json({ ok: true, status: 'ignored_event_type' });
  }

  const broadcasterId = readBroadcasterId(subscriptionType, event);
  if (!broadcasterId) {
    return res.status(200).json({ ok: true, status: 'no_broadcaster' });
  }

  const tenantId = await resolveTenantForBroadcaster(broadcasterId);
  if (tenantId === undefined) {
    res.setHeader('Retry-After', '60');
    return res
      .status(503)
      .json({ error: 'Channel lookup failed', code: 'CHANNEL_LOOKUP_FAILED' });
  }
  if (tenantId === null) {
    return res.status(200).json({ ok: true, status: 'unknown_channel' });
  }

  if (!supabaseAdmin) {
    res.setHeader('Retry-After', '60');
    return res
      .status(503)
      .json({ error: 'Database unavailable', code: 'DB_UNAVAILABLE' });
  }

  // `message_id` en clé d'idempotence : Twitch REJOUE un message quand il n'a
  // pas eu son 2xx à temps, avec le même identifiant. C'est ce qui empêche
  // d'annoncer deux fois le même sub.
  const { error } = await supabaseAdmin.from('stream_alert_events').upsert(
    {
      tenant_id: tenantId,
      twitch_message_id: verified.messageId,
      kind: row.kind,
      actor_name: row.actorName,
      amount: row.amount,
      tier: row.tier,
    },
    { onConflict: 'tenant_id,twitch_message_id', ignoreDuplicates: true }
  );

  if (error) {
    // Une écriture ratée MÉRITE un réessai : l'alerte est perdue sinon, et
    // c'est précisément ce que Twitch sait rattraper.
    logger.error(
      '[twitch/alerts] écriture impossible: %s',
      (error as { message?: string }).message ?? String(error)
    );
    res.setHeader('Retry-After', '30');
    return res
      .status(503)
      .json({ error: 'Write failed', code: 'WRITE_FAILED' });
  }

  return res.status(200).json({ ok: true, status: 'stored', kind: row.kind });
}
