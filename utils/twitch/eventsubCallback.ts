// utils/twitch/eventsubCallback.ts — l'URL de rappel des abonnements EventSub
// en transport webhook (alertes, drop TCG, votes du chat).
//
// POURQUOI UNE ORIGINE À PART. Ces URL ne sont PAS des liens donnés à des
// humains : c'est l'adresse où Twitch POSTe ses notifications. Elle peut donc
// vivre ailleurs que le site (service API séparé, derrière CloudFront) sans
// que les liens d'e-mails ou de DM — qui lisent `SITE_URL` via
// `absoluteSiteUrl` — en soient affectés. `EVENTSUB_CALLBACK_ORIGIN` ne sert
// QU'ICI ; absente, le rappel reste sur l'origine du site, comme avant.
//
// TWITCH NE MODIFIE PAS UN CALLBACK. Changer d'origine laisse les abonnements
// existants pointer vers l'ancienne. `classifyEventsubCallback` les reconnaît
// (même chemin, origine connue de NOUS mais pas l'actuelle) pour qu'on les
// recrée vers la nouvelle puis qu'on supprime l'ancien. Une origine inconnue
// (aperçu, tunnel local partageant l'application Twitch) n'est jamais touchée.
//
// TRANSITION : les deux récepteurs (site et API) vérifient la signature avec
// le même `TWITCH_EVENTSUB_SECRET` ; un abonnement ancien ou nouveau est donc
// servi tant que les deux tournent. La variable doit valoir la MÊME chose sur
// les deux déploiements, sinon chacun jugerait périmés les abonnements créés
// par l'autre.

import { logger } from '@/utils/logger';
import { absoluteSiteUrl } from '@/utils/siteUrl';

export const EVENTSUB_CALLBACK_ORIGIN_ENV = 'EVENTSUB_CALLBACK_ORIGIN';

let warnedInvalid: string | null = null;

/**
 * Valide une origine de rappel : `https://hote[:port]`, rien d'autre — ni
 * chemin, ni barre finale, ni requête, ni identifiants. Renvoie `null` sinon.
 */
export function parseEventsubCallbackOrigin(
  raw: string | undefined
): string | null {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  // `URL.origin` n'a ni chemin, ni barre finale, ni requête, ni identifiants :
  // toute différence avec la saisie trahit l'un d'eux.
  if (url.origin !== value) return null;
  return url.origin;
}

/** Origine du site (celle des liens), sans barre finale. */
function siteOrigin(): string {
  return absoluteSiteUrl('');
}

/**
 * Origine où Twitch doit livrer. Lue à chaque appel (la variable se pose dans
 * l'hébergeur, et les tests la changent). Une valeur invalide est IGNORÉE avec
 * un avertissement : retomber sur le site garde les alertes en marche, alors
 * qu'un rappel faux les ferait refuser par Twitch.
 */
export function eventsubCallbackOrigin(): string {
  const raw = process.env[EVENTSUB_CALLBACK_ORIGIN_ENV];
  const parsed = parseEventsubCallbackOrigin(raw);
  if (parsed) return parsed;
  if (raw?.trim() && warnedInvalid !== raw) {
    warnedInvalid = raw;
    logger.warn(
      '[eventsub] %s invalide (https://hote attendu, sans barre finale) : origine du site utilisée',
      EVENTSUB_CALLBACK_ORIGIN_ENV
    );
  }
  return siteOrigin();
}

/** URL de rappel actuelle pour le récepteur `path` (qui commence par `/`). */
export function eventsubCallbackUrl(path: string): string {
  return `${eventsubCallbackOrigin()}${path}`;
}

/**
 * Situe un callback lu chez Twitch par rapport au récepteur `path` :
 *   - `current` : l'URL actuelle, rien à faire ;
 *   - `stale`   : notre récepteur sur une AUTRE de nos origines (le site quand
 *     le rappel est parti vers l'API, ou l'inverse) — à recréer ;
 *   - `null`    : pas à nous, on n'y touche pas.
 */
export function classifyEventsubCallback(
  callback: string | undefined,
  path: string
): 'current' | 'stale' | null {
  if (!callback) return null;
  const current = eventsubCallbackUrl(path);
  if (callback === current) return 'current';
  const known = new Set([siteOrigin(), eventsubCallbackOrigin()]);
  for (const origin of known) {
    if (callback === `${origin}${path}`) return 'stale';
  }
  return null;
}

/** Exporté pour les tests : réarme l'avertissement unique. */
export function __resetEventsubCallbackWarning() {
  warnedInvalid = null;
}
