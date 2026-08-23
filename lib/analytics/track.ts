// lib/analytics/track.ts
//
// Envoi des pageviews et des événements de conversion, agnostique du
// fournisseur (cf. config.ts) et conditionné au consentement (cf. consent.ts).
//
// Triple garde avant tout envoi : côté client, fournisseur configuré,
// consentement `analytics` accordé. Si l'une des trois manque, c'est un no-op
// silencieux — jamais une erreur : la mesure ne doit JAMAIS casser une page.

import { readAnalyticsConfig } from './config';
import { hasAnalyticsConsent } from './consent';

/**
 * Étapes de l'entonnoir. Liste fermée : un nom d'événement mal orthographié
 * crée une métrique fantôme qu'on ne remarque que trois mois plus tard.
 */
export const ANALYTICS_EVENTS = {
  /** Première interaction réelle avec le formulaire d'inscription. */
  registerStart: 'register_start',
  /** Compte créé (réponse 200 de /api/auth/register). */
  registerDone: 'register_done',
  /** Équipe créée depuis /team/create. */
  teamCreated: 'team_created',
  /** Demande d'adhésion envoyée à une équipe existante. */
  joinRequestSent: 'join_request_sent',
  /** Check-in confirmé par une capitaine. */
  checkinDone: 'checkin_done',
  /** Formulaire newsletter soumis avec succès (avant double opt-in). */
  newsletterSubmit: 'newsletter_submit',
} as const;

export type AnalyticsEvent =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

export type EventProps = Record<string, string | number | boolean>;

type PlausibleFn = (
  event: string,
  opts?: { u?: string; props?: EventProps }
) => void;

type UmamiApi = {
  track: (
    nameOrPayload?: string | ((props: Record<string, unknown>) => unknown),
    data?: EventProps
  ) => void;
};

declare global {
  interface Window {
    plausible?: PlausibleFn;
    umami?: UmamiApi;
  }
}

// Le script du collecteur est chargé de façon asynchrone : un événement peut
// partir avant qu'il ne soit prêt (rare, mais un `register_start` sur une
// première frappe très rapide y arriverait). On tamponne le temps du
// chargement plutôt que de perdre l'événement. Borné : au-delà, c'est que le
// script ne viendra pas (bloqué, hors ligne) et on préfère jeter.
const MAX_QUEUED = 20;
let scriptReady = false;
let queued: Array<() => void> = [];

/** Appelé par AnalyticsScript quand le script du collecteur a fini de charger. */
export function markAnalyticsReady(): void {
  scriptReady = true;
  const pending = queued;
  queued = [];
  pending.forEach((send) => {
    try {
      send();
    } catch {
      /* la mesure ne casse jamais une page */
    }
  });
}

/** Remise à zéro — réservé aux tests. */
export function resetAnalyticsQueueForTests(): void {
  scriptReady = false;
  queued = [];
}

function dispatch(send: () => void): void {
  if (!scriptReady) {
    if (queued.length < MAX_QUEUED) queued.push(send);
    return;
  }
  try {
    send();
  } catch {
    /* la mesure ne casse jamais une page */
  }
}

/** Les trois conditions d'envoi, évaluées à chaque appel (le consentement bouge). */
function enabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (!readAnalyticsConfig()) return false;
  return hasAnalyticsConsent();
}

/**
 * Envoie un événement de conversion.
 *
 * `props` reste volontairement pauvre : jamais d'identifiant de compte, jamais
 * d'email — uniquement des dimensions agrégeables (`role`, `has_team`…).
 */
export function trackEvent(name: AnalyticsEvent, props?: EventProps): void {
  if (!enabled()) return;
  const config = readAnalyticsConfig();
  if (!config) return;

  dispatch(() => {
    if (config.provider === 'plausible') {
      window.plausible?.(name, props ? { props } : undefined);
    } else {
      window.umami?.track(name, props);
    }
  });
}

/**
 * Envoie une pageview. Appelé au chargement ET à chaque navigation SPA — les
 * scripts sont chargés en mode manuel précisément pour que ce soit notre seul
 * point d'émission (cf. config.ts, `scriptPath`).
 */
export function trackPageview(url?: string): void {
  if (!enabled()) return;
  const config = readAnalyticsConfig();
  if (!config) return;

  const path = url ?? window.location.pathname + window.location.search;
  const absolute = new URL(path, window.location.origin).toString();

  dispatch(() => {
    if (config.provider === 'plausible') {
      window.plausible?.('pageview', { u: absolute });
    } else {
      window.umami?.track((props: Record<string, unknown>) => ({
        ...props,
        url: path,
      }));
    }
  });
}
