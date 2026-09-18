// utils/twitch/eventsubRequest.ts
//
// L'AUTHENTIFICATION D'UNE LIVRAISON EVENTSUB — la seule barrière entre une URL
// publique et ce qu'elle déclenche.
//
// Ce code vivait dans `pages/api/webhooks/twitch/tcg-drop.ts`, seul récepteur
// EventSub du dépôt. Une deuxième route en a eu besoin (la boîte d'alertes), et
// une fonction de signature recopiée est une fonction qu'on corrigera à un seul
// endroit le jour où elle aura un défaut. Elle est donc ici, une fois.
//
// L'ORDRE DES CONTRÔLES EST LE CONTRAT, et il ne se réarrange pas :
//   1. secret configuré, sinon on REFUSE (fail-closed) ;
//   2. en-têtes présents ;
//   3. corps lu, borné ;
//   4. SIGNATURE, avant tout parsing et tout accès base ;
//   5. fenêtre anti-rejeu ;
//   6. seulement ensuite, le JSON.
// Une charge non authentifiée ne doit atteindre aucune logique métier.

import crypto from 'crypto';
import type { NextApiRequest } from 'next';

/** Secret partagé, choisi PAR NOUS à la création de la souscription EventSub. */
export const EVENTSUB_SECRET_ENV = 'TWITCH_EVENTSUB_SECRET';

/**
 * Fenêtre d'acceptation de l'horodatage (10 min, la valeur recommandée par
 * Twitch). Une signature, elle, reste valide éternellement : sans cette borne,
 * un message capté une fois pourrait être rejoué indéfiniment.
 */
export const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000;

/**
 * Plafond du corps lu. Une charge EventSub pèse quelques kilo-octets ; le
 * plafond évite qu'une requête sans fin fasse gonfler la mémoire, `bodyParser`
 * étant désactivé — donc sans la limite que Next applique d'ordinaire.
 */
export const MAX_BODY_BYTES = 64 * 1024;

/** Comparaison à temps constant (longueurs comparées hors-bande). */
export function constantTimeEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Signature attendue : `sha256=` + HMAC-SHA256(secret, id + timestamp + corps).
 *
 * Exportée pour être testée seule.
 */
export function computeTwitchSignature(
  secret: string,
  messageId: string,
  timestamp: string,
  rawBody: Buffer
): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(messageId + timestamp);
  hmac.update(rawBody);
  return `sha256=${hmac.digest('hex')}`;
}

/** Octets reçus, ou `null` si le plafond est dépassé. */
export async function readRawBody(req: NextApiRequest): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf: Buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as string);
    total += buf.length;
    if (total > MAX_BODY_BYTES) return null;
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

/** Première valeur d'un en-tête, doublons ignorés. */
export function header(req: NextApiRequest, name: string): string | null {
  const raw = req.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export type EventSubMessageType =
  | 'webhook_callback_verification'
  | 'notification'
  | 'revocation';

export type EventSubVerification =
  | {
      ok: true;
      /** `null` quand le type est signé mais inconnu de nous (ajout côté Twitch). */
      messageType: EventSubMessageType | null;
      rawBody: Buffer;
      messageId: string;
    }
  | {
      ok: false;
      status: 400 | 403 | 413 | 503;
      code:
        | 'WEBHOOK_NOT_CONFIGURED'
        | 'MISSING_HEADERS'
        | 'PAYLOAD_TOO_LARGE'
        | 'INVALID_SIGNATURE'
        | 'INVALID_TIMESTAMP'
        | 'STALE_MESSAGE';
      error: string;
    };

const KNOWN_TYPES: readonly string[] = [
  'webhook_callback_verification',
  'notification',
  'revocation',
];

/**
 * Authentifie la livraison et rend le corps BRUT.
 *
 * Ne parse pas le JSON : chaque route a sa propre forme de charge utile, et le
 * corps brut est ce sur quoi porte la signature.
 *
 * `now` est injecté pour que la fenêtre anti-rejeu soit testable sans attendre.
 */
export async function verifyEventSubRequest(
  req: NextApiRequest,
  { secret, now = Date.now() }: { secret: string | undefined; now?: number }
): Promise<EventSubVerification> {
  if (!secret) {
    return {
      ok: false,
      status: 503,
      code: 'WEBHOOK_NOT_CONFIGURED',
      error: 'Webhook not configured',
    };
  }

  const messageId = header(req, 'twitch-eventsub-message-id');
  const timestamp = header(req, 'twitch-eventsub-message-timestamp');
  const signature = header(req, 'twitch-eventsub-message-signature');
  const rawType = header(req, 'twitch-eventsub-message-type');

  if (!messageId || !timestamp || !signature || !rawType) {
    return {
      ok: false,
      status: 400,
      code: 'MISSING_HEADERS',
      error: 'Missing Twitch EventSub headers',
    };
  }

  const rawBody = await readRawBody(req);
  if (rawBody === null) {
    return {
      ok: false,
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      error: 'Payload too large',
    };
  }

  // ── Signature D'ABORD ──────────────────────────────────────────────────
  const expected = computeTwitchSignature(
    secret,
    messageId,
    timestamp,
    rawBody
  );
  if (!constantTimeEqual(signature, expected)) {
    return {
      ok: false,
      status: 403,
      code: 'INVALID_SIGNATURE',
      error: 'Invalid signature',
    };
  }

  const sentAt = Date.parse(timestamp);
  if (!Number.isFinite(sentAt)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_TIMESTAMP',
      error: 'Invalid timestamp',
    };
  }
  if (Math.abs(now - sentAt) > MAX_MESSAGE_AGE_MS) {
    return {
      ok: false,
      status: 403,
      code: 'STALE_MESSAGE',
      error: 'Message too old',
    };
  }

  return {
    ok: true,
    // Type inconnu mais SIGNÉ : c'est un ajout côté Twitch, pas une attaque.
    // L'appelant acquitte pour ne pas faire désactiver la souscription.
    messageType: KNOWN_TYPES.includes(rawType)
      ? (rawType as EventSubMessageType)
      : null,
    rawBody,
    messageId,
  };
}
