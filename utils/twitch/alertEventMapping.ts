// utils/twitch/alertEventMapping.ts
//
// D'UNE CHARGE EVENTSUB À UNE LIGNE DE `stream_alert_events`.
//
// Pur, donc testable sans webhook ni base : c'est ici que se règlent les
// chausse-trapes du format Twitch, et elles ne se devinent pas en lisant la
// route.
//
// LES TROIS PIÈGES QUE CE MODULE DÉSAMORCE :
//
// 1. UN SUB OFFERT ARRIVE DEUX FOIS. Offrir 20 abonnements déclenche UN
//    `channel.subscription.gift` (« Machine offre 20 abonnements ») ET VINGT
//    `channel.subscribe` avec `is_gift: true`, un par bénéficiaire. Sans le
//    filtre, une seule générosité produirait 21 alertes et bloquerait
//    l'antenne plusieurs minutes. On garde le gift, on jette les subs offerts.
//
// 2. L'ANONYMAT EXISTE. Un gift et un cheer peuvent être anonymes ; Twitch
//    envoie alors `is_anonymous: true` et un nom absent ou « AnAnonymous… ».
//    On stocke `null`, et la source dira « Quelqu'un » — taire l'alerte
//    priverait la chaîne d'un remerciement qu'elle doit.
//
// 3. UN RAID SE LIT DANS LE BON SENS. `channel.raid` porte deux chaînes ; celle
//    qui nous intéresse est `from_broadcaster_user_name` (qui arrive), pas
//    `to_` (nous). Se tromper afficherait « Women's Cup débarque avec 42
//    spectateurs » sur notre propre antenne.

import type { AlertKind } from '@/utils/overlay/alertBox';

/** Les souscriptions que la boîte d'alertes demande à Twitch. */
export const ALERT_SUBSCRIPTIONS = [
  { type: 'channel.follow', version: '2', scope: 'moderator:read:followers' },
  {
    type: 'channel.subscribe',
    version: '1',
    scope: 'channel:read:subscriptions',
  },
  {
    type: 'channel.subscription.gift',
    version: '1',
    scope: 'channel:read:subscriptions',
  },
  {
    type: 'channel.subscription.message',
    version: '1',
    scope: 'channel:read:subscriptions',
  },
  { type: 'channel.cheer', version: '1', scope: 'bits:read' },
  // Aucun scope : un raid entrant est public.
  { type: 'channel.raid', version: '1', scope: null },
] as const;

export type AlertEventRow = {
  kind: AlertKind;
  actorName: string | null;
  amount: number | null;
  tier: string | null;
};

/** Ce que la base accepte (cf. le CHECK de `stream_alert_events.tier`). */
const TIERS = new Set(['prime', '1000', '2000', '3000']);

function readTier(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const tier = value.trim().toLowerCase();
  return TIERS.has(tier) ? tier : null;
}

/** Nom affichable, ou `null` — jamais une chaîne vide, jamais plus de 60. */
function readName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (!name) return null;
  return name.slice(0, 60);
}

/** Entier positif, ou `null`. Twitch envoie parfois une chaîne. */
function readCount(value: unknown): number | null {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function isTrue(value: unknown): boolean {
  return value === true || value === 'true';
}

/**
 * La ligne à insérer, ou `null` quand il n'y a rien à annoncer.
 *
 * `null` n'est PAS une erreur : c'est le cas nominal d'un `channel.subscribe`
 * offert (cf. piège n°1) ou d'un type auquel on n'est pas abonné. L'appelant
 * acquitte en 200 — faire échouer la livraison ferait retenter Twitch, puis
 * désactiver la souscription.
 */
export function mapAlertEvent(
  subscriptionType: string,
  event: Record<string, unknown> | null | undefined
): AlertEventRow | null {
  if (!event || typeof event !== 'object') return null;

  switch (subscriptionType) {
    case 'channel.follow':
      return {
        kind: 'follow',
        actorName: readName(event.user_name) ?? readName(event.user_login),
        amount: null,
        tier: null,
      };

    case 'channel.subscribe': {
      // PIÈGE N°1 : le sub offert est déjà annoncé par `…gift`.
      if (isTrue(event.is_gift)) return null;
      return {
        kind: 'sub',
        actorName: readName(event.user_name) ?? readName(event.user_login),
        amount: null,
        tier: readTier(event.tier),
      };
    }

    case 'channel.subscription.gift':
      return {
        kind: 'gift',
        // PIÈGE N°2 : l'anonymat prime sur le nom que Twitch enverrait quand
        // même.
        actorName: isTrue(event.is_anonymous)
          ? null
          : (readName(event.user_name) ?? readName(event.user_login)),
        amount: readCount(event.total),
        tier: readTier(event.tier),
      };

    case 'channel.subscription.message':
      return {
        kind: 'resub',
        actorName: readName(event.user_name) ?? readName(event.user_login),
        // Les mois CUMULÉS, pas la série en cours : c'est le chiffre que la
        // spectatrice annonce elle-même dans son message.
        amount: readCount(event.cumulative_months),
        tier: readTier(event.tier),
      };

    case 'channel.cheer':
      return {
        kind: 'cheer',
        actorName: isTrue(event.is_anonymous)
          ? null
          : (readName(event.user_name) ?? readName(event.user_login)),
        amount: readCount(event.bits),
        tier: null,
      };

    case 'channel.raid':
      return {
        kind: 'raid',
        // PIÈGE N°3 : celle qui ARRIVE.
        actorName: readName(event.from_broadcaster_user_name),
        amount: readCount(event.viewers),
        tier: null,
      };

    default:
      return null;
  }
}

/**
 * La chaîne concernée par la livraison.
 *
 * Un raid porte DEUX chaînes : c'est `to_broadcaster_user_id` qui désigne la
 * nôtre (on ne s'abonne qu'aux raids entrants). Pour tous les autres types,
 * c'est `broadcaster_user_id`.
 */
export function readBroadcasterId(
  subscriptionType: string,
  event: Record<string, unknown> | null | undefined
): string | null {
  if (!event) return null;
  const raw =
    subscriptionType === 'channel.raid'
      ? event.to_broadcaster_user_id
      : event.broadcaster_user_id;
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}
