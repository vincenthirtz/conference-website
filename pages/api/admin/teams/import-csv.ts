// pages/api/admin/teams/import-csv.ts
// POST : import en masse d'équipes via CSV (texte brut)
//
// Body : { csv: string, tournamentId?: string }
// Format CSV attendu : name,short_name,country,players
//   - players : liste de battle_tags séparés par ";"
//   - Première ligne = en-tête (ignorée)
//
// Retourne : { created: number, errors: { row: number, message: string }[] }

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';

type ImportResult = {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
  teams: { id: string; name: string }[];
};

type ApiResponse = ImportResult | { error: string };

export default withStaffRoute(handler, 'admin');

export const config = {
  api: { bodyParser: { sizeLimit: '2mb' } },
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: any
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { csv, tournamentId } = req.body || {};

  if (!csv || typeof csv !== 'string') {
    return res.status(400).json({
      error: 'Le champ "csv" est requis (texte CSV brut).',
    });
  }

  // Parse CSV lines
  const lines = csv
    .split(/\r?\n/)
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0);

  if (lines.length < 2) {
    return res.status(400).json({
      error: 'Le CSV doit contenir au moins un en-tête et une ligne de données.',
    });
  }

  // Parse header to detect column mapping
  const headerLine = lines[0].toLowerCase();
  const headers = parseCsvLine(headerLine);
  const colMap = detectColumns(headers);

  if (colMap.name < 0) {
    return res.status(400).json({
      error: 'Colonne "name" (ou "nom") introuvable dans l\'en-tête CSV.',
    });
  }

  const MAX_ROWS = 200;
  if (lines.length - 1 > MAX_ROWS) {
    return res.status(400).json({
      error: `Trop de lignes (${lines.length - 1}). Maximum ${MAX_ROWS} équipes par import.`,
    });
  }

  const result: ImportResult = { created: 0, skipped: 0, errors: [], teams: [] };

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const cols = parseCsvLine(lines[i]);
    const name = cols[colMap.name]?.trim();

    if (!name) {
      result.errors.push({ row: rowNum, message: 'Nom d\'equipe manquant' });
      continue;
    }

    const shortName = colMap.short_name >= 0 ? cols[colMap.short_name]?.trim() || null : null;
    const country = colMap.country >= 0 ? cols[colMap.country]?.trim() || null : null;
    const playersRaw = colMap.players >= 0 ? cols[colMap.players]?.trim() || '' : '';

    // Check duplicate name
    const { data: existing } = await supabaseAdmin
      .from('teams')
      .select('id')
      .ilike('name', name)
      .maybeSingle();

    if (existing) {
      result.skipped++;
      result.errors.push({ row: rowNum, message: `Equipe "${name}" existe deja (${existing.id})` });
      continue;
    }

    // Generate slug
    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Create team
    const { data: team, error: teamErr } = await supabaseAdmin
      .from('teams')
      .insert({
        name,
        short_name: shortName,
        slug,
        country,
        is_active: true,
      })
      .select('id, name')
      .single();

    if (teamErr || !team) {
      result.errors.push({ row: rowNum, message: teamErr?.message || 'Echec creation equipe' });
      continue;
    }

    // Parse and create players (battle_tags separated by ";")
    if (playersRaw) {
      const battleTags = playersRaw
        .split(';')
        .map((bt: string) => bt.trim())
        .filter((bt: string) => bt.length > 0);

      for (const bt of battleTags) {
        const { error: memberErr } = await supabaseAdmin
          .from('team_members')
          .insert({
            team_id: team.id,
            role: 'player',
            battle_tag: bt,
          });

        if (memberErr) {
          result.errors.push({
            row: rowNum,
            message: `Joueur "${bt}": ${memberErr.message}`,
          });
        }
      }
    }

    // Register to tournament if specified (upsert to avoid duplicate constraint violation)
    if (tournamentId) {
      const { error: ttErr } = await supabaseAdmin
        .from('tournament_teams')
        .upsert(
          { tournament_id: tournamentId, team_id: team.id, status: 'registered' },
          { onConflict: 'tournament_id,team_id', ignoreDuplicates: true }
        );

      if (ttErr) {
        result.errors.push({
          row: rowNum,
          message: `Inscription tournoi: ${ttErr.message}`,
        });
      }
    }

    result.created++;
    result.teams.push({ id: team.id, name: team.name });
  }

  // Log staff action
  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'staff_batch_action',
        entity_type: 'team',
        tournament_id: tournamentId || null,
        payload: {
          action_label: 'csv_import',
          created: result.created,
          skipped: result.skipped,
          error_count: result.errors.length,
          team_ids: result.teams.map((t) => t.id),
        },
      });
    } catch (e) {
      console.error('csv import logStaffAction error:', e);
    }
  }

  return res.status(200).json(result);
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
    const h = headers[i].trim().toLowerCase().replace(/[^a-z_]/g, '');
    if (['name', 'nom', 'team', 'equipe', 'teamname'].includes(h)) map.name = i;
    else if (['short_name', 'shortname', 'tag', 'abrev', 'abbreviation', 'sigle'].includes(h)) map.short_name = i;
    else if (['country', 'pays', 'nation', 'region'].includes(h)) map.country = i;
    else if (['players', 'joueurs', 'members', 'membres', 'battle_tags', 'battletags', 'roster'].includes(h)) map.players = i;
  }
  return map;
}
