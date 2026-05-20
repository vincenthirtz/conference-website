// pages/api/admin/teams/import-csv.ts
// POST : import en masse d'équipes via CSV (texte brut)
//
// Body : { csv: string, tournamentId?: string }
// Format CSV attendu : name,short_name,country,players
//   - players : liste de battle_tags séparés par ";"
//   - Première ligne = en-tête (ignorée)
//
// Retourne : { created, skipped, errors, teams }

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logger } from '../../../../utils/logger';
import {
  importTeams,
  MAX_ROWS,
  type ImportResult,
  type TeamImportRow,
} from '@/utils/teamImport';

type ApiResponse = ImportResult | { error: string };

export default withStaffRoute(handler, 'admin');

export const config = {
  api: { bodyParser: { sizeLimit: '2mb' } },
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { csv, tournamentId } = req.body || {};

  if (!csv || typeof csv !== 'string') {
    return res.status(400).json({
      error: 'Le champ "csv" est requis (texte CSV brut).',
    });
  }

  const lines = csv
    .split(/\r?\n/)
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0);

  if (lines.length < 2) {
    return res.status(400).json({
      error:
        'Le CSV doit contenir au moins un en-tête et une ligne de données.',
    });
  }

  const headerLine = lines[0].toLowerCase();
  const headers = parseCsvLine(headerLine);
  const colMap = detectColumns(headers);

  if (colMap.name < 0) {
    return res.status(400).json({
      error: 'Colonne "name" (ou "nom") introuvable dans l\'en-tête CSV.',
    });
  }

  if (lines.length - 1 > MAX_ROWS) {
    return res.status(400).json({
      error: `Trop de lignes (${lines.length - 1}). Maximum ${MAX_ROWS} équipes par import.`,
    });
  }

  const rows: TeamImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const playersRaw =
      colMap.players >= 0 ? cols[colMap.players]?.trim() || '' : '';
    rows.push({
      name: cols[colMap.name]?.trim() || '',
      short_name:
        colMap.short_name >= 0 ? cols[colMap.short_name]?.trim() || null : null,
      country:
        colMap.country >= 0 ? cols[colMap.country]?.trim() || null : null,
      players: playersRaw
        ? playersRaw
            .split(';')
            .map((bt: string) => bt.trim())
            .filter(Boolean)
        : [],
    });
  }

  try {
    const result = await importTeams(rows, {
      tenantId: ctx.tenantId,
      tournamentId:
        typeof tournamentId === 'string' && tournamentId
          ? tournamentId
          : undefined,
      sourceLabel: 'csv_import',
      staffId: ctx?.staff?.id ?? null,
    });
    return res.status(200).json(result);
  } catch (err: unknown) {
    logger.error('[admin/teams/import-csv] error:', err);
    return res
      .status(500)
      .json({ error: (err as Error)?.message || 'Erreur import CSV' });
  }
}

/** Simple CSV line parser that handles quoted fields */
function parseCsvLine(line: string): string[] {
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
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',' || ch === ';' || ch === '\t') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

/** Detect column indices from header names */
function detectColumns(headers: string[]): {
  name: number;
  short_name: number;
  country: number;
  players: number;
} {
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
