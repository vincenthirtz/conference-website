// utils/teamImport.ts
// Logique partagée d'import d'équipes (CSV + plateformes externes).
// Crée les teams, les team_members (battle_tags), et inscrit optionnellement
// au tournoi via tournament_teams.

import { supabaseAdmin } from './supabase';
import { logStaffAction } from './staffLogs';

export const MAX_NAME = 100;
export const MAX_SHORT_NAME = 20;
export const MAX_COUNTRY = 10;
export const MAX_BATTLE_TAG = 50;
export const MAX_ROWS = 200;

export type TeamImportRow = {
  name: string;
  short_name?: string | null;
  country?: string | null;
  players?: string[];
  external_ref?: { source: string; id: string };
};

export type ImportResult = {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
  teams: { id: string; name: string }[];
};

export type ImportSourceLabel =
  | 'csv_import'
  | 'toornament_import'
  | 'challonge_import'
  | 'startgg_import';

export type ImportTeamsOptions = {
  tournamentId?: string;
  sourceLabel: ImportSourceLabel;
  staffId?: string | null;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function importTeams(
  rows: TeamImportRow[],
  opts: ImportTeamsOptions
): Promise<ImportResult> {
  if (!supabaseAdmin) {
    throw new Error('Database service unavailable (missing service role).');
  }
  const admin = supabaseAdmin;

  const result: ImportResult = {
    created: 0,
    skipped: 0,
    errors: [],
    teams: [],
  };

  if (rows.length > MAX_ROWS) {
    throw new Error(
      `Trop de lignes (${rows.length}). Maximum ${MAX_ROWS} équipes par import.`
    );
  }

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 1;
    const row = rows[i];
    const name = row.name?.trim();

    if (!name) {
      result.errors.push({ row: rowNum, message: "Nom d'équipe manquant" });
      continue;
    }

    if (name.length > MAX_NAME) {
      result.errors.push({
        row: rowNum,
        message: `Nom trop long (max ${MAX_NAME} car.)`,
      });
      continue;
    }

    const shortName = row.short_name
      ? row.short_name.trim().slice(0, MAX_SHORT_NAME) || null
      : null;
    const country = row.country
      ? row.country.trim().slice(0, MAX_COUNTRY) || null
      : null;

    const { data: existing } = await admin
      .from('teams')
      .select('id')
      .ilike('name', name)
      .maybeSingle();

    if (existing) {
      result.skipped++;
      result.errors.push({
        row: rowNum,
        message: `Équipe "${name}" existe déjà (${existing.id})`,
      });
      continue;
    }

    const slug = slugify(name);

    const { data: team, error: teamErr } = await admin
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
      result.errors.push({
        row: rowNum,
        message: teamErr?.message || 'Échec création équipe',
      });
      continue;
    }

    const players = (row.players ?? [])
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    for (const rawBt of players) {
      const bt = rawBt.slice(0, MAX_BATTLE_TAG);
      const { error: memberErr } = await admin.from('team_members').insert({
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

    if (opts.tournamentId) {
      const { error: ttErr } = await admin.from('tournament_teams').upsert(
        {
          tournament_id: opts.tournamentId,
          team_id: team.id,
          status: 'registered',
        },
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

  if (opts.staffId) {
    try {
      await logStaffAction({
        staff_id: opts.staffId,
        action: 'staff_batch_action',
        entity_type: 'team',
        tournament_id: opts.tournamentId || null,
        payload: {
          action_label: opts.sourceLabel,
          created: result.created,
          skipped: result.skipped,
          error_count: result.errors.length,
          team_ids: result.teams.map((t) => t.id),
        },
      });
    } catch (e) {
      console.error('importTeams logStaffAction error:', e);
    }
  }

  return result;
}
