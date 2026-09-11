// utils/teams/teamExportClient.ts
//
// Moitié CLIENT de l'export des équipes (CSV + PDF) : URLs de la route et de la
// page imprimable, lecture de la query de cette page, nom du fichier téléchargé.
//
// Le contrat JSON de la route vient de sa source (`./teamExport`), en import
// de TYPE seulement : effacé à la compilation, il n'embarque rien dans le
// bundle, et tsc casse ici le jour où la route change sa forme.
//
// Fonctions pures (ni DOM ni React) : tests/unit/teamExportClient.test.ts.

import type {
  ExportMember,
  ExportTeam,
  TeamsExportPayload,
} from './teamExport';

export type { ExportMember, ExportTeam };
export type TeamExportPayload = TeamsExportPayload;

/** Les filtres de la liste `/admin/teams`, tels que portés par l'URL. */
export type TeamExportFilters = {
  search?: string | null;
  isActive?: string | null;
  tournamentId?: string | null;
};

/** Une équipe précise, OU la liste filtrée — jamais les deux. */
export type TeamExportTarget =
  | { teamId: string }
  | { filters: TeamExportFilters };

export type TeamExportFormat = 'csv' | 'json';

export const TEAM_EXPORT_API_PATH = '/api/admin/teams/export';
export const TEAM_PRINT_PAGE_PATH = '/admin/teams/print';

type QueryValue = string | string[] | undefined;
type QueryLike = Record<string, QueryValue>;

function first(value: QueryValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** La liste ne connaît que `true` / `false` ; le reste veut dire « toutes ». */
function normalizeIsActive(value: string | null | undefined): string | null {
  return value === 'true' || value === 'false' ? value : null;
}

export function isSingleTeamTarget(
  target: TeamExportTarget
): target is { teamId: string } {
  return 'teamId' in target;
}

/**
 * Paramètres qui désignent CE QUI est exporté — communs à la route (CSV/JSON),
 * à la page imprimable et au lien de retour vers la liste. Un filtre vide est
 * omis plutôt qu'envoyé vide : l'URL reste celle qu'on aurait tapée.
 */
export function teamExportParams(target: TeamExportTarget): URLSearchParams {
  const params = new URLSearchParams();
  if (isSingleTeamTarget(target)) {
    const teamId = target.teamId.trim();
    if (teamId) params.set('teamId', teamId);
    return params;
  }
  const search = target.filters.search?.trim();
  const isActive = normalizeIsActive(target.filters.isActive);
  const tournamentId = target.filters.tournamentId?.trim();
  if (search) params.set('search', search);
  if (isActive) params.set('isActive', isActive);
  if (tournamentId) params.set('tournamentId', tournamentId);
  return params;
}

export function buildTeamExportApiUrl(
  target: TeamExportTarget,
  format: TeamExportFormat
): string {
  const params = teamExportParams(target);
  params.set('format', format);
  return `${TEAM_EXPORT_API_PATH}?${params.toString()}`;
}

export function buildTeamPrintPageUrl(
  target: TeamExportTarget,
  { autoprint = false }: { autoprint?: boolean } = {}
): string {
  const params = teamExportParams(target);
  if (autoprint) params.set('autoprint', '1');
  const qs = params.toString();
  return qs ? `${TEAM_PRINT_PAGE_PATH}?${qs}` : TEAM_PRINT_PAGE_PATH;
}

/** Relit la cible depuis la query de la page imprimable (`router.query`). */
export function parseTeamExportTarget(query: QueryLike): TeamExportTarget {
  const teamId = first(query.teamId)?.trim();
  if (teamId) return { teamId };
  return {
    filters: {
      search: first(query.search)?.trim() || null,
      isActive: normalizeIsActive(first(query.isActive)),
      tournamentId: first(query.tournamentId)?.trim() || null,
    },
  };
}

export function isAutoprintRequested(query: QueryLike): boolean {
  return first(query.autoprint) === '1';
}

const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|]/g;

function sanitizeFilename(name: string): string {
  const printable = Array.from(name)
    .filter((c) => c.charCodeAt(0) >= 32)
    .join('');
  return printable
    .replace(UNSAFE_FILENAME_CHARS, '_')
    .trim()
    .replace(/^\.+/, '');
}

/**
 * Nom de fichier annoncé par `Content-Disposition`. `filename*` (RFC 5987,
 * encodé UTF-8) prime sur `filename`, comme le veut RFC 6266 : c'est lui qui
 * porte les accents d'un nom de tournoi. Renvoie `null` si l'en-tête est absent
 * ou inexploitable — l'appelant a alors son propre repli.
 */
export function filenameFromContentDisposition(
  header: string | null | undefined
): string | null {
  if (!header) return null;

  const star = /filename\*\s*=\s*([^;]+)/i.exec(header);
  if (star) {
    const raw = star[1].trim().replace(/^"(.*)"$/, '$1');
    const charsetMatch = /^[\w-]*'[^']*'(.*)$/.exec(raw);
    const encoded = charsetMatch ? charsetMatch[1] : raw;
    try {
      const decoded = sanitizeFilename(decodeURIComponent(encoded));
      if (decoded) return decoded;
    } catch {
      // Encodage invalide : on retombe sur `filename` s'il existe.
    }
  }

  const plain = /filename\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;]+))/i.exec(header);
  if (plain) {
    const value =
      plain[1] !== undefined ? plain[1].replace(/\\(.)/g, '$1') : plain[2];
    return sanitizeFilename(value) || null;
  }
  return null;
}

/** Repli quand la route n'annonce aucun nom exploitable. */
export function fallbackTeamExportFilename(
  target: TeamExportTarget,
  now: Date = new Date()
): string {
  const day = now.toISOString().slice(0, 10);
  if (isSingleTeamTarget(target)) {
    return `equipe-${sanitizeFilename(target.teamId).slice(0, 8)}-${day}.csv`;
  }
  return `equipes-${day}.csv`;
}

function asMembers(value: unknown): ExportMember[] {
  return Array.isArray(value) ? (value as ExportMember[]) : [];
}

/**
 * Tolère un payload partiel plutôt que de planter la page d'impression : un
 * bloc de membres absent devient une liste vide, une date illisible une
 * chaîne vide (la feuille n'affiche alors pas de date).
 */
export function normalizeTeamExportPayload(raw: unknown): TeamExportPayload {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<
    Record<keyof TeamExportPayload, unknown>
  >;
  const tournament = obj.tournament as TeamExportPayload['tournament'];
  const teams = Array.isArray(obj.teams) ? (obj.teams as ExportTeam[]) : [];
  return {
    generatedAt: typeof obj.generatedAt === 'string' ? obj.generatedAt : '',
    tournament:
      tournament && typeof tournament.name === 'string' ? tournament : null,
    truncated: obj.truncated === true,
    teams: teams
      .filter((team) => team && typeof team === 'object')
      .map((team) => ({
        ...team,
        members: {
          roster: asMembers(team.members?.roster),
          subs: asMembers(team.members?.subs),
          staff: asMembers(team.members?.staff),
        },
      })),
  };
}
