// utils/teamImport.ts
// Logique partagée d'import d'équipes (CSV + plateformes externes).
// Crée les teams, rattache au roster les joueuses qui ont un compte, et inscrit
// optionnellement au tournoi via tournament_teams.
//
// MODÈLE DU ROSTER. `team_members.user_id` est NOT NULL et référence
// `auth.users` : une ligne de roster EST un compte. Un import ne connaît que
// des BattleTags ; on ne rattache donc que celles dont le BattleTag est lié à un
// compte (`user_battlenet_links`, écrit par la vérification Blizzard). Les
// autres ne sont pas inventées : elles sont remontées une par une dans
// `errors`, pour que le staff les invite depuis le roster (e-mail ou lien
// d'invitation), comme pour toute joueuse sans compte.

import { supabaseAdmin } from './supabase';
import { logStaffAction } from './staffLogs';

import { logger } from './logger';
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
  tenantId: string;
  tournamentId?: string;
  sourceLabel: ImportSourceLabel;
  staffId?: string | null;
};

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

type AdminClient = NonNullable<typeof supabaseAdmin>;

/**
 * Rattache au roster de `teamId` les BattleTags liés à un compte. Renvoie un
 * message par BattleTag NON rattaché (sans compte, déjà dans une équipe de
 * l'espace, échec d'écriture) : rien n'est avalé.
 */
export async function attachRoster(
  admin: AdminClient,
  input: { tenantId: string; teamId: string; battleTags: string[] }
): Promise<string[]> {
  const tags = Array.from(new Set(input.battleTags.filter(Boolean)));
  if (tags.length === 0) return [];

  const { data: links, error: linkErr } = await admin
    .from('user_battlenet_links')
    .select('auth_user_id, battle_tag')
    .in('battle_tag', tags);
  if (linkErr) {
    return tags.map(
      (bt) =>
        `Joueuse "${bt}" : recherche du compte impossible (${linkErr.message})`
    );
  }
  const userByTag = new Map<string, string>();
  for (const l of links ?? []) {
    if (l.battle_tag && l.auth_user_id)
      userByTag.set(l.battle_tag, l.auth_user_id);
  }

  const errors: string[] = [];
  for (const bt of tags) {
    const userId = userByTag.get(bt);
    if (!userId) {
      errors.push(
        `Joueuse "${bt}" : aucun compte lié à ce BattleTag — à inviter depuis le roster`
      );
      continue;
    }
    const { error } = await admin.from('team_members').insert({
      tenant_id: input.tenantId,
      team_id: input.teamId,
      user_id: userId,
      role: 'player',
      battle_tag: bt,
    });
    if (error) {
      const duplicate =
        error.code === '23505' || /duplicate|unique/i.test(error.message ?? '');
      errors.push(
        duplicate
          ? `Joueuse "${bt}" : déjà dans une équipe de cet espace`
          : `Joueuse "${bt}" : ${error.message}`
      );
    }
  }
  return errors;
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

    const { data: existing, error: existingErr } = await admin
      .from('teams')
      .select('id')
      .ilike('name', name)
      .eq('tenant_id', opts.tenantId)
      .maybeSingle();

    if (existingErr) {
      result.errors.push({
        row: rowNum,
        message: `Vérification du doublon impossible : ${existingErr.message}`,
      });
      continue;
    }

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
        tenant_id: opts.tenantId,
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

    const rosterErrors = await attachRoster(admin, {
      tenantId: opts.tenantId,
      teamId: team.id,
      battleTags: players.map((p) => p.slice(0, MAX_BATTLE_TAG)),
    });
    for (const message of rosterErrors) {
      result.errors.push({ row: rowNum, message });
    }

    if (opts.tournamentId) {
      const { error: ttErr } = await admin.from('tournament_teams').upsert(
        {
          tenant_id: opts.tenantId,
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
      logger.error('importTeams logStaffAction error:', e);
    }
  }

  return result;
}
