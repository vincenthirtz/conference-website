// features/admin/teams/service/imports.ts — import d'équipes en masse
// (`/api/admin/teams/import-csv`, `/api/admin/teams/import-platform`).
//
// Les deux chemins aboutissent à `importTeams` (utils/teamImport), qui crée
// les équipes, les inscrit éventuellement et écrit LUI-MÊME le journal
// staff : les routes déclarent donc `audit: false`.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  importTeams,
  MAX_ROWS,
  type ImportResult,
  type ImportSourceLabel,
  type TeamImportRow,
} from '@/utils/teamImport';
import { fetchToornamentParticipants } from '@/utils/tournamentImport/toornament';
import { fetchChallongeParticipants } from '@/utils/tournamentImport/challonge';
import { fetchStartGgParticipants } from '@/utils/tournamentImport/startgg';
import {
  PlatformImportError,
  type PlatformSource,
} from '@/utils/tournamentImport/types';
import * as imports from '../repository/imports';
import { fail } from './common';

function staffIdOf(ctx: ServiceContext): string | null {
  return ctx.actor.kind === 'staff' ? ctx.actor.staffId : null;
}

function optionalTournament(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw ? raw : undefined;
}

/* --------------------------------- CSV --------------------------------- */

export type CsvDelimiter = ',' | ';' | '\t';

/**
 * Séparateur de colonnes, déduit de l'EN-TÊTE : `,` s'il y figure, sinon `;`
 * (export Excel FR), sinon tabulation. Un seul séparateur par fichier : le
 * `;` qui sépare les joueuses d'une cellule n'est PAS une fin de colonne
 * dans un CSV à virgules — le parser coupait « Alice#1;Bob#2 » en deux
 * colonnes et Bob disparaissait sans erreur.
 */
export function detectCsvDelimiter(headerLine: string): CsvDelimiter {
  if (headerLine.includes(',')) return ',';
  if (headerLine.includes(';')) return ';';
  if (headerLine.includes('\t')) return '\t';
  return ',';
}

/** Ligne CSV, champs entre guillemets compris, sur UN séparateur. */
export function parseCsvLine(
  line: string,
  delimiter: CsvDelimiter = ','
): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/** Colonnes reconnues par leur nom d'en-tête (FR / EN, variantes). */
function detectColumns(headers: string[]) {
  const map = { name: -1, short_name: -1, country: -1, players: -1 };
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]
      .trim()
      .toLowerCase()
      .replace(/[^a-z_]/g, '');
    if (['name', 'nom', 'team', 'equipe', 'teamname'].includes(h)) map.name = i;
    else if (
      [
        'short_name',
        'shortname',
        'tag',
        'abrev',
        'abbreviation',
        'sigle',
      ].includes(h)
    )
      map.short_name = i;
    else if (['country', 'pays', 'nation', 'region'].includes(h))
      map.country = i;
    else if (
      [
        'players',
        'joueurs',
        'members',
        'membres',
        'battle_tags',
        'battletags',
        'roster',
      ].includes(h)
    )
      map.players = i;
  }
  return map;
}

/**
 * Format : `name,short_name,country,players` (joueuses séparées par `;`),
 * première ligne = en-tête.
 */
export async function importTeamsFromCsv(
  ctx: ServiceContext,
  body: Record<string, unknown>
): Promise<ImportResult> {
  const { csv, tournamentId } = body;
  if (!csv || typeof csv !== 'string') {
    throw fail(400, 'Le champ "csv" est requis (texte CSV brut).');
  }

  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) {
    throw fail(
      400,
      'Le CSV doit contenir au moins un en-tête et une ligne de données.'
    );
  }

  const delimiter = detectCsvDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0].toLowerCase(), delimiter);
  const colMap = detectColumns(headers);
  if (colMap.name < 0) {
    throw fail(
      400,
      'Colonne "name" (ou "nom") introuvable dans l\'en-tête CSV.'
    );
  }
  if (lines.length - 1 > MAX_ROWS) {
    throw fail(
      400,
      `Trop de lignes (${lines.length - 1}). Maximum ${MAX_ROWS} équipes par import.`
    );
  }

  const rows: TeamImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], delimiter);
    // Joueuses en DERNIÈRE colonne d'un CSV à `;` : leurs propres `;` ont
    // découpé la cellule — on recolle le reste de la ligne.
    const playersCell =
      colMap.players < 0
        ? ''
        : delimiter === ';' && colMap.players === headers.length - 1
          ? cols.slice(colMap.players).join(';')
          : cols[colMap.players];
    const playersRaw = playersCell?.trim() || '';
    rows.push({
      name: cols[colMap.name]?.trim() || '',
      short_name:
        colMap.short_name >= 0 ? cols[colMap.short_name]?.trim() || null : null,
      country:
        colMap.country >= 0 ? cols[colMap.country]?.trim() || null : null,
      players: playersRaw
        ? playersRaw
            .split(';')
            .map((bt) => bt.trim())
            .filter(Boolean)
        : [],
    });
  }

  try {
    return await importTeams(rows, {
      tenantId: ctx.tenantId,
      tournamentId: optionalTournament(tournamentId),
      sourceLabel: 'csv_import',
      staffId: staffIdOf(ctx),
    });
  } catch (err: unknown) {
    ctx.logger.error('[admin/teams/import-csv] error:', err);
    throw fail(500, (err as Error)?.message || 'Erreur import CSV');
  }
}

/* ----------------------------- plateformes ----------------------------- */

const SETTING_KEYS: Record<PlatformSource, string> = {
  toornament: 'toornament_api_key',
  challonge: 'challonge_api_key',
  startgg: 'startgg_api_key',
};

const SOURCE_LABELS: Record<PlatformSource, ImportSourceLabel> = {
  toornament: 'toornament_import',
  challonge: 'challonge_import',
  startgg: 'startgg_import',
};

/**
 * Toornament / Challonge / start.gg. La clé API est lue dans les réglages
 * de l'espace PAR DÉFAUT (comportement d'origine, conservé).
 */
export async function importTeamsFromPlatform(
  ctx: ServiceContext,
  body: Record<string, unknown>
): Promise<ImportResult> {
  const { source, sourceRef, tournamentId } = body;

  if (
    source !== 'toornament' &&
    source !== 'challonge' &&
    source !== 'startgg'
  ) {
    throw fail(
      400,
      'Source invalide. Attendu : toornament | challonge | startgg.'
    );
  }
  if (!sourceRef || typeof sourceRef !== 'string' || !sourceRef.trim()) {
    throw fail(400, 'Le champ "sourceRef" (URL ou ID) est requis.');
  }

  const settingKey = SETTING_KEYS[source];
  // Clé de l'espace du staff — jamais celle du tenant par défaut, qui faisait
  // importer chaque espace avec le compte (et le quota) de l'association.
  const setting = await imports.getSiteSetting(
    ctx.db,
    ctx.tenantId,
    settingKey
  );
  const rawValue = setting?.value as unknown;
  const apiKey = typeof rawValue === 'string' ? rawValue.trim() : undefined;
  if (!apiKey) {
    throw fail(
      400,
      `Clé API non configurée. Renseignez "${settingKey}" dans les paramètres.`
    );
  }

  try {
    let rows: TeamImportRow[];
    switch (source) {
      case 'toornament':
        rows = await fetchToornamentParticipants(sourceRef, apiKey);
        break;
      case 'challonge':
        rows = await fetchChallongeParticipants(sourceRef, apiKey);
        break;
      case 'startgg':
        rows = await fetchStartGgParticipants(sourceRef, apiKey);
        break;
    }

    if (rows.length === 0) {
      return {
        created: 0,
        skipped: 0,
        errors: [
          { row: 0, message: 'Aucune équipe renvoyée par la plateforme.' },
        ],
        teams: [],
      };
    }

    return await importTeams(rows, {
      tenantId: ctx.tenantId,
      tournamentId: optionalTournament(tournamentId),
      sourceLabel: SOURCE_LABELS[source],
      staffId: staffIdOf(ctx),
    });
  } catch (err: unknown) {
    if (err instanceof PlatformImportError) {
      const httpStatus =
        err.status >= 400 && err.status < 600 ? err.status : 502;
      throw fail(httpStatus, err.message);
    }
    ctx.logger.error('[admin/teams/import-platform] error:', err);
    throw fail(500, (err as Error)?.message || 'Erreur import plateforme');
  }
}
