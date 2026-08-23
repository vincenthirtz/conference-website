// lib/analytics — point d'entrée unique de la mesure d'audience.
//
// Vue d'ensemble : `config` (quel collecteur), `consent` (a-t-on le droit),
// `track` (envoi), `attribution` (d'où vient l'inscription).
export { readAnalyticsConfig, buildAnalyticsConfig } from './config';
export type { AnalyticsConfig, AnalyticsProvider } from './config';
export { hasAnalyticsConsent, subscribeToAnalyticsConsent } from './consent';
export {
  ANALYTICS_EVENTS,
  trackEvent,
  trackPageview,
  markAnalyticsReady,
} from './track';
export type { AnalyticsEvent, EventProps } from './track';
export {
  captureAttribution,
  readStoredAttribution,
  resolveSignupSource,
  parseAttribution,
} from './attribution';
export type { Attribution } from './attribution';
