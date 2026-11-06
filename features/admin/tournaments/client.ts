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
import type { AdminPoolView } from '@/features/admin/tournaments/model';
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
  /** Debriefs de fin de tournoi : lecture (GET) et demande au bot (POST). */
  debriefs: (id: string) => `${T}/${enc(id)}/debriefs`,
  /** Règlement à valider : versions (GET), dépôt d'une version (POST). */
  rules: (id: string) => `${T}/${enc(id)}/rules`,
  /** Validations du règlement, équipe par équipe. */
  rulesStatus: (id: string) => `${T}/${enc(id)}/rules/status`,
  /** Le PDF d'une version (route PUBLIQUE, même origine). */
  rulesFile: (id: string, version: number) =>
    `/api/tournaments/${enc(id)}/rules/file?version=${enc(String(version))}`,
  debriefRequest: (id: string) => `${T}/${enc(id)}/debrief-request`,
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

/**
 * Debrief d'une équipe (conference-api, table `tournament_debriefs`) : les
 * deux cases remplies dans Discord. L'une des deux peut être vide, jamais les
 * deux (le serveur refuse un debrief vide).
 */
export type TournamentDebrief = {
  positives: string | null;
  negatives: string | null;
  updated_at: string;
};

/** Une équipe ENGAGÉE dans le tournoi, qu'elle ait répondu ou non. */
export type TournamentDebriefTeam = {
  team_id: string;
  name: string;
  logo_url: string | null;
  debrief: TournamentDebrief | null;
};

/** `GET /api/admin/tournament/[id]/debriefs`. */
export type TournamentDebriefsResponse = { teams: TournamentDebriefTeam[] };

/**
 * `POST /api/admin/tournament/[id]/debrief-request` : `requested` équipes
 * engagées, dont `withChannel` ont un salon privé Discord (les autres ne
 * reçoivent rien, le bot les ignore).
 */
export type TournamentDebriefRequestResult = {
  requested: number;
  withChannel: number;
};

/** Une version déposée du règlement (les anciennes sont gardées : preuve). */
export type TournamentRulesVersion = {
  id: string;
  number: number;
  fileName: string | null;
  sizeBytes: number | null;
  /** `true` : « changement important », tout le monde a dû revalider. */
  requiresRevalidation: boolean;
  note: string | null;
  createdAt: string;
  /** Nom du membre du staff qui a déposé (ou son id), `null` si inconnu. */
  createdBy: string | null;
};

/** `GET /api/admin/tournament/[id]/rules`. */
export type TournamentRulesAdminView = {
  /** Réglage « Règlement à valider par chaque membre ». */
  required: boolean;
  versions: TournamentRulesVersion[];
};

export type TournamentRulesMember = {
  /** `null` : membre sans compte — ne peut pas valider, compte manquant. */
  userId: string | null;
  name: string;
  role: string | null;
  accepted: boolean;
  acceptedAt: string | null;
};

export type TournamentRulesTeamStatus = {
  teamId: string;
  name: string;
  complete: boolean;
  validated: number;
  total: number;
  members: TournamentRulesMember[];
};

/** `GET /api/admin/tournament/[id]/rules/status`. */
export type TournamentRulesStatusView = { teams: TournamentRulesTeamStatus[] };

/** Corps du dépôt d'une version (PDF en data URL, comme `/api/admin/upload`). */
export type TournamentRulesUploadBody = {
  /** `data:application/pdf;base64,…` */
  data: string;
  mimeType: 'application/pdf';
  filename: string;
  requiresRevalidation: boolean;
  note: string | null;
};

export const tournamentsClient = {
  pool: (id: string) => adminRequest<AdminPoolView>(tournamentUrls.pool(id)),
  rules: (id: string) =>
    adminRequest<TournamentRulesAdminView>(tournamentUrls.rules(id)),
  rulesStatus: (id: string) =>
    adminRequest<TournamentRulesStatusView>(tournamentUrls.rulesStatus(id)),
  /** La clé d'idempotence tient le temps d'UN dépôt (nouvel essai = rejeu). */
  uploadRules: (
    id: string,
    body: TournamentRulesUploadBody,
    idempotencyKey: string
  ) =>
    adminRequest<
      { version?: TournamentRulesVersion } & Partial<TournamentRulesVersion>
    >(tournamentUrls.rules(id), {
      method: 'POST',
      json: body,
      idempotent: true,
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
  templates: () =>
    adminRequest<{ templates?: TournamentTemplate[] }>(
      tournamentsUrls.templates
    ),
  debriefs: (id: string) =>
    adminRequest<TournamentDebriefsResponse>(tournamentUrls.debriefs(id)),
  /**
   * La clé d'idempotence vient de l'appelant : elle tient le temps d'UNE
   * intention (un nouvel essai après une coupure rejoue la réponse au lieu de
   * renvoyer le message dans chaque salon).
   */
  requestDebrief: (id: string, idempotencyKey: string) =>
    adminRequest<TournamentDebriefRequestResult>(
      tournamentUrls.debriefRequest(id),
      {
        method: 'POST',
        idempotent: true,
        headers: { 'Idempotency-Key': idempotencyKey },
      }
    ),
};
