// features/admin/tournaments/client.ts — appels typés des écrans du tournoi
// (hub, matchs, édition, outils, planning, stats, check-in, pool, cagnotte…),
// lot L10, vague client 2.
//
// Les URLs de l'API vivent ICI, plus dans les pages. Les ÉCRITURES qui
// passaient par `useIdempotentMutation` (file hors ligne, `BgSyncQueuedError`)
// y restent : ce module ne leur fournit que leurs chemins (`tournamentUrls`,
// `tournamentsUrls`, `tournamentMatchUrls`).
//
// `tournamentMatchUrls` : sous-ressources d'un match appelées DEPUIS les
// panneaux du tournoi (veto, check-in, MVP public, pool de maps). Le domaine
// « matchs » a son propre module ; ces chemins restent ici tant que les deux
// n'ont pas été rapprochés.

import { AdminHttpError, adminRequest } from '@/utils/admin/adminHttp';
import type { AdminPoolView } from '@/pages/api/admin/tournament/[id]/pool';
import type { TournamentTemplate } from '@/config/tournament-templates';

const T = '/api/admin/tournament';
const TS = '/api/admin/tournaments';
const enc = encodeURIComponent;

/** Chaîne de requête sans les valeurs vides (`undefined`, `null`, ''). */
export function qs(
  params: Record<string, string | number | boolean | null | undefined>
): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

/**
 * Message d'erreur de l'écran quand l'API n'en a pas donné (`json.error ||
 * libellé`, le motif des écrans avant migration) : le message du serveur
 * passe tel quel, sinon le libellé de repli remplace « Requête échouée (…) ».
 */
export function withFallback<T>(p: Promise<T>, fallback: string): Promise<T> {
  return p.catch((err: unknown) => {
    const serverMessage =
      err instanceof AdminHttpError &&
      err.payload &&
      typeof err.payload === 'object' &&
      'error' in err.payload;
    throw new Error(
      serverMessage || !(err instanceof AdminHttpError)
        ? (err as Error).message || fallback
        : fallback
    );
  });
}

/** Ressources d'UN tournoi (`/api/admin/tournament/[id]/…`). */
export const tournamentUrls = {
  byId: (id: string) => `${T}/${enc(id)}`,
  dashboard: (id: string) => `${T}/${enc(id)}/dashboard`,
  teams: (id: string) => `${T}/${enc(id)}/teams`,
  team: (id: string, teamId: string) => `${T}/${enc(id)}/teams/${enc(teamId)}`,
  stages: (id: string) => `${T}/${enc(id)}/stages`,
  /** `query` : chaîne déjà construite (sans `?`), ou paramètres. */
  matches: (
    id: string,
    query?:
      | string
      | Record<string, string | number | boolean | null | undefined>
  ) =>
    `${T}/${enc(id)}/matches${
      typeof query === 'string' ? (query ? `?${query}` : '') : qs(query ?? {})
    }`,
  bulkMatches: (id: string) => `${T}/${enc(id)}/bulk-matches`,
  bracket: (id: string) => `${T}/${enc(id)}/bracket`,
  clone: (id: string) => `${T}/${enc(id)}/clone`,
  applyTemplate: (id: string) => `${T}/${enc(id)}/apply-template`,
  pool: (id: string) => `${T}/${enc(id)}/pool`,
  history: (id: string, params: URLSearchParams) =>
    `${T}/${enc(id)}/history?${params.toString()}`,
  scheduleDiagnostics: (id: string, rest: number, concurrent: number) =>
    `${T}/${enc(id)}/schedule-diagnostics${qs({ rest, concurrent })}`,
  scheduleMove: (id: string) => `${T}/${enc(id)}/schedule-move`,
  discordWebhooks: (id: string, channelType?: string) =>
    `${T}/${enc(id)}/discord-webhooks${qs({ channelType })}`,
  discordTest: (id: string) => `${T}/${enc(id)}/discord-test`,
  checkin: (id: string) => `${T}/${enc(id)}/checkin`,
  checkinSettings: (id: string) => `${T}/${enc(id)}/checkin-settings`,
  reviewsPlaylist: (id: string) => `${T}/${enc(id)}/reviews-playlist`,
  checkinNudgeAll: (id: string) => `${T}/${enc(id)}/checkin-nudge-all`,
  stats: (id: string) => `${T}/${enc(id)}/stats`,
  analytics: (id: string) => `${T}/${enc(id)}/analytics`,
  podiumPreview: (id: string) => `${T}/${enc(id)}/podium-preview`,
  finalize: (id: string) => `${T}/${enc(id)}/finalize`,
  /** Classements MVP : `mvp-leaderboard`, `mvp-public`… (segment libre). */
  sub: (id: string, segment: string) => `${T}/${enc(id)}/${segment}`,
  overlayDay: (id: string) => `${T}/${enc(id)}/overlay-day`,
  exportResults: (id: string, format: 'csv' | 'json') =>
    `${T}/${enc(id)}/export-results?format=${format}`,
  prizePool: (id: string) => `${TS}/${enc(id)}/prize-pool`,
};

/** Collection des tournois et ressources transverses. */
export const tournamentsUrls = {
  collection: TS,
  list: (limit: number) => `${TS}?limit=${limit}`,
  notifyCaptains: `${TS}/notify-captains`,
  templates: '/api/admin/tournament-templates',
  /** Équipes du tenant (sélecteur « ajouter une équipe » du hub). */
  teamOptions: (limit: number) => `/api/admin/teams?limit=${limit}`,
  /** Équipes actives (simulateur : « charger de vraies équipes »). */
  activeTeams: (limit: number) =>
    `/api/admin/teams?limit=${limit}&isActive=true`,
  streamAlerts: '/api/admin/stream-alerts',
  streamAlertTest: '/api/admin/stream-alert-test',
  twitchEventsubAlerts: '/api/admin/twitch/eventsub/alerts',
  upload: '/api/admin/upload',
};

/** Sous-ressources d'un match appelées depuis les panneaux du tournoi. */
export const tournamentMatchUrls = {
  byId: (matchId: string) => `/api/admin/matches/${enc(matchId)}`,
  veto: (matchId: string) => `/api/admin/matches/${enc(matchId)}/veto`,
  checkinNudge: (matchId: string) =>
    `/api/admin/matches/${enc(matchId)}/checkin-nudge`,
  checkinStaff: (matchId: string) =>
    `/api/admin/matches/${enc(matchId)}/checkin-staff`,
  mvpPublic: (matchId: string) =>
    `/api/admin/matches/${enc(matchId)}/mvp-public`,
  mapPool: (matchId: string) => `/api/admin/matches/${enc(matchId)}/map-pool`,
};

export const tournamentsClient = {
  pool: (id: string) => adminRequest<AdminPoolView>(tournamentUrls.pool(id)),
  templates: () =>
    adminRequest<{ templates?: TournamentTemplate[] }>(
      tournamentsUrls.templates
    ),
};
