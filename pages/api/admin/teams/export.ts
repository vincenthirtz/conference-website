// pages/api/admin/teams/export.ts
//
// GET /api/admin/teams/export — extraction des équipes (CSV ou JSON).
//
// - `?teamId=<uuid>` : une seule équipe (404 TEAM_NOT_FOUND si absente du
//   tenant ou dans la corbeille) ;
// - sinon les MÊMES filtres que la liste admin (`search`, `isActive`,
//   `tournamentId`, cf. utils/teams/adminTeamsFilters.ts), sans pagination mais
//   plafonné à TEAM_EXPORT_MAX_TEAMS équipes (`truncated` le signale).
// - `?format=csv|json` (défaut json). Le JSON alimente la page imprimable de
//   l'admin ; le CSV s'ouvre dans Excel FR (BOM, `;`, CRLF).
//
// Mise en forme pure (répartition, pseudo, CSV, nom de fichier) :
// utils/teams/teamExport.ts. Aucune donnée personnelle au-delà de l'identité
// de jeu (pseudo, BattleTag, pseudo Discord) — voir l'en-tête de ce module.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { sanitizeSearch } from '@/utils/apiHelpers';
import { uuidSchema } from '@/utils/botValidation';
import { fetchAdminUserProfiles } from '@/utils/adminUserProfiles';
import {
  applyAdminTeamsFilters,
  fetchTournamentRegistrations,
  parseActiveFilter,
} from '@/utils/teams/adminTeamsFilters';
import {
  TEAM_EXPORT_MAX_TEAMS,
  buildExportTeam,
  buildTeamsCsv,
  sortExportTeams,
  teamsExportFilename,
  type RawExportMember,
  type RawExportTeam,
  type TeamsExportPayload,
} from '@/utils/teams/teamExport';
import { logger } from '@/utils/logger';

export default withStaffRoute(handler, { permission: 'manage_teams' });

/** Un paramètre vide (`?tournamentId=`) vaut « pas de filtre », pas un 400. */
function optionalParam<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
}

const querySchema = z.object({
  teamId: optionalParam(uuidSchema),
  tournamentId: optionalParam(uuidSchema),
  search: optionalParam(z.string()),
  isActive: optionalParam(z.string()),
  format: optionalParam(z.enum(['csv', 'json'])),
});

/** PostgREST plafonne une réponse à 1000 lignes (`max_rows` Supabase). */
const PAGE_SIZE = 1000;
/** Taille des lots d'ids passés à `.in()` (longueur d'URL PostgREST). */
const ID_CHUNK = 100;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

type MemberRow = RawExportMember & { team_id: string };

async function fetchMembers(
  tenantId: string,
  teamIds: readonly string[]
): Promise<MemberRow[]> {
  const out: MemberRow[] = [];
  for (const ids of chunk(teamIds, ID_CHUNK)) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabaseAdmin
        .from('team_members')
        .select(
          'id, team_id, user_id, role, specialty, is_substitute, battle_tag, display_name'
        )
        .eq('tenant_id', tenantId)
        .in('team_id', ids)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      // Un effectif incomplet ne doit pas partir en silence : 500.
      if (error) throw error;
      const rows = (data ?? []) as MemberRow[];
      out.push(...rows);
      if (rows.length < PAGE_SIZE) break;
    }
  }
  return out;
}

/** `auth_user_id -> discord_username`, par lots (best-effort). */
async function fetchDiscordUsernames(
  userIds: readonly string[]
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  for (const ids of chunk(userIds, ID_CHUNK * 2)) {
    const { data, error } = await supabaseAdmin
      .from('user_discord_links')
      .select('auth_user_id, discord_username')
      .in('auth_user_id', ids);
    if (error) {
      logger.warn('[/api/admin/teams/export] discord links lookup:', error);
      continue;
    }
    for (const row of (data ?? []) as Array<{
      auth_user_id: string | null;
      discord_username: string | null;
    }>) {
      if (row?.auth_user_id) {
        map.set(row.auth_user_id, row.discord_username ?? null);
      }
    }
  }
  return map;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    return res.status(400).json({
      error: 'Paramètres invalides.',
      code: 'INVALID_QUERY',
      fields,
    });
  }

  const { teamId, tournamentId } = parsed.data;
  const format = parsed.data.format ?? 'json';
  const search = sanitizeSearch(parsed.data.search);
  const isActive = parseActiveFilter(parsed.data.isActive);

  try {
    // --- Tournoi (scopé tenant) -------------------------------------------
    let tournament: { id: string; name: string } | null = null;
    let registrations = new Map<string, string | null>();
    if (tournamentId) {
      const { data: tRow, error: tErr } = await supabaseAdmin
        .from('tournaments')
        .select('id, name')
        .eq('id', tournamentId)
        .eq('tenant_id', ctx.tenantId)
        .maybeSingle();
      if (tErr) throw tErr;
      if (!tRow) {
        return res.status(404).json({
          error: 'Tournoi introuvable.',
          code: 'TOURNAMENT_NOT_FOUND',
        });
      }
      tournament = {
        id: (tRow as { id: string }).id,
        name: String((tRow as { name: string | null }).name ?? ''),
      };
      const reg = await fetchTournamentRegistrations(
        ctx.tenantId,
        tournamentId
      );
      if (reg.error) throw reg.error;
      registrations = reg.registrations;
    }

    // --- Équipes ----------------------------------------------------------
    const teamColumns = 'id, name, short_name, logo_url, captain_id';
    let teamRows: RawExportTeam[] = [];
    let truncated = false;

    if (teamId) {
      const { data, error } = await supabaseAdmin
        .from('teams')
        .select(teamColumns)
        .eq('id', teamId)
        .eq('tenant_id', ctx.tenantId)
        .is('deleted_at', null)
        .limit(1);
      if (error) throw error;
      teamRows = (data ?? []) as RawExportTeam[];
      if (teamRows.length === 0) {
        return res.status(404).json({
          error: 'Équipe introuvable.',
          code: 'TEAM_NOT_FOUND',
        });
      }
    } else if (!tournamentId || registrations.size > 0) {
      let query = applyAdminTeamsFilters(
        supabaseAdmin
          .from('teams')
          .select(teamColumns)
          .eq('tenant_id', ctx.tenantId),
        { search, isActive, includeDeleted: false }
      );
      if (tournamentId) {
        query = query.in('id', [...registrations.keys()]);
      }
      const { data, error } = await query
        .order('name', { ascending: true })
        .limit(TEAM_EXPORT_MAX_TEAMS + 1);
      if (error) throw error;
      teamRows = (data ?? []) as RawExportTeam[];
      truncated = teamRows.length > TEAM_EXPORT_MAX_TEAMS;
      if (truncated) teamRows = teamRows.slice(0, TEAM_EXPORT_MAX_TEAMS);
    }

    // --- Effectifs + enrichissements (une passe pour tout le lot) ---------
    const members = await fetchMembers(
      ctx.tenantId,
      teamRows.map((t) => t.id)
    );
    const userIds = [
      ...new Set(
        members.map((m) => m.user_id).filter((id): id is string => !!id)
      ),
    ];
    const [discordByUser, profiles] = await Promise.all([
      fetchDiscordUsernames(userIds),
      // Pseudo du COMPTE, seulement pour qui n'a pas de surcharge d'équipe.
      // On ne lit que `display_name` : `full_name` peut être un nom réel.
      fetchAdminUserProfiles(
        members.filter((m) => !m.display_name).map((m) => m.user_id)
      ),
    ]);
    const accountNames = new Map<string, string | null>();
    for (const [id, p] of profiles) accountNames.set(id, p.display_name);

    const membersByTeam = new Map<string, MemberRow[]>();
    for (const m of members) {
      const list = membersByTeam.get(m.team_id) ?? [];
      list.push(m);
      membersByTeam.set(m.team_id, list);
    }

    const teams = sortExportTeams(
      teamRows.map((t) =>
        buildExportTeam(t, membersByTeam.get(t.id) ?? [], {
          registrationStatus: tournamentId
            ? (registrations.get(t.id) ?? null)
            : null,
          accountNames,
          discordByUser,
        })
      )
    );

    // --- Journal (export de données de joueuses) --------------------------
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'view_player_data',
      entity_type: 'team',
      entity_id: teamId ?? null,
      tournament_id: tournamentId ?? null,
      tenant_id: ctx.tenantId,
      permission: 'manage_teams',
      payload: {
        kind: 'teams_export',
        format,
        ...(teamId
          ? { teamId }
          : {
              filters: {
                search: search || null,
                isActive: isActive ?? null,
                tournamentId: tournamentId ?? null,
              },
            }),
        count: teams.length,
        truncated,
      },
    });

    const now = new Date();

    if (format === 'csv') {
      const filename = teamsExportFilename({
        date: now,
        single: Boolean(teamId),
        teamName: teams[0]?.name ?? null,
        tournamentName: tournament ? tournament.name : null,
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`
      );
      return res.status(200).send(buildTeamsCsv(teams));
    }

    const payload: TeamsExportPayload = {
      generatedAt: now.toISOString(),
      tournament,
      truncated,
      teams,
    };
    return res.status(200).json(payload);
  } catch (err: unknown) {
    logger.error('[/api/admin/teams/export] internal error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
