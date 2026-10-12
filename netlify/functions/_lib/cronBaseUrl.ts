// netlify/functions/_lib/cronBaseUrl.ts
// Source de vérité unique de l'origine visée par les fonctions planifiées
// (`netlify/functions/*-cron.ts` → `${cronBaseUrl()}/api/cron/<x>`).
//
// Pourquoi une variable dédiée : `URL` est réservée par Netlify et ne peut pas
// être surchargée. Pour basculer les crons vers l'API séparée
// (https://api.owwomenscup.fr) sans toucher au site, on pose
// `CRON_API_BASE_URL` dans le dashboard Netlify.
//
// - `CRON_API_BASE_URL` défini et valide (https, sans identifiants, query ni
//   fragment) → utilisé, slash(es) final(aux) retiré(s).
// - défini mais invalide (http, URL illisible…) → ignoré avec une erreur dans
//   les logs, et repli sur l'ancien enchaînement : les crons continuent de
//   viser l'API Netlify plutôt que d'échouer en silence ou d'envoyer le
//   CRON_SECRET en clair.
// - absent ou vide → `URL || SITE_URL || 'https://owwomenscup.fr'`, valeur
//   renvoyée telle quelle (comportement strictement identique à l'existant ;
//   les appelants retirent eux-mêmes le slash final).
//
// Ce fichier n'est pas déployé comme fonction : zip-it-and-ship-it ne traite
// un sous-dossier comme fonction que s'il contient `index.ts` ou `<dossier>.ts`.

import { logger } from '../../../utils/logger';

type Env = Record<string, string | undefined>;

/** Valide une surcharge ; renvoie l'origine normalisée ou `null`. */
export function parseCronApiBaseUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.search || parsed.hash) return null;
  return raw.replace(/\/+$/, '');
}

export function cronBaseUrl(env: Env = process.env): string {
  const override = env.CRON_API_BASE_URL?.trim();
  if (override) {
    const normalized = parseCronApiBaseUrl(override);
    if (normalized) return normalized;
    logger.error(
      '[cronBaseUrl] CRON_API_BASE_URL ignorée (https requis, sans identifiants, query ni fragment) : repli sur URL/SITE_URL'
    );
  }
  return env.URL || env.SITE_URL || 'https://owwomenscup.fr';
}
