// pages/api/admin/demandes/index.ts
// Admin: gestion des demandes (join/leave, etc.)
// - GET  : liste filtrable/paginée des demandes
// - POST : batch update du statut de plusieurs demandes

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '../../../../utils/logger';
import {
  parsePagination,
  sanitizeSearch,
  escapePostgrestValue,
  isValidUUID,
} from '@/utils/apiHelpers';

export type DemandeType =
  | 'join'
  | 'leave'
  | 'captain_request'
  | 'team_registration'
  | 'scrim'
  | 'other';

export type DemandeStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type DemandeRow = {
  id: string;
  user_id: string | null;
  team_id: string | null;
  tournament_id: string | null;
  type: DemandeType;
  status: DemandeStatus;
  comment: string | null; // commentaire public / interne
  staff_note: string | null; // note interne staff
  processed_by_staff_id: string | null;
  processed_at: string | null;
  source: string | null; // "website", "discord", etc.
  payload: any | null; // JSONB extra
  created_at: string;
  updated_at: string | null;
};

type DemandeWithRelations = DemandeRow & {
  user?: {
    id: string;
    username: string | null;
    battle_tag: string | null;
    discord: string | null;
  } | null;
  team?: {
    id: string;
    name: string;
    short_name: string | null;
    logo_url: string | null;
  } | null;
  tournament?: {
    id: string;
    name: string;
    slug: string | null;
  } | null;
};

type GetDemandesResponse = {
  demandes: DemandeWithRelations[];
  total: number | null;
};

type BatchUpdateStatusBody = {
  action: 'updateStatus';
  demandeIds: string[];
  newStatus: DemandeStatus;
  staffComment?: string | null;
};

type PostBody = BatchUpdateStatusBody;

// rôle minimum : caster (le support peut traiter les demandes)
export default withStaffRoute(handler, 'caster');

async function handler(req: NextApiRequest, res: NextApiResponse, ctx: any) {
  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(req, res);
      case 'POST':
        return await handlePost(req, res, ctx);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err: unknown) {
    logger.error('[/api/admin/demandes] internal error:', err);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
}

/* -----------------------------------------------------------
 * GET : liste des demandes avec filtres avancés
 *
 * Query params :
 *  - type?: "join" | "leave" | "other"
 *  - status?: "pending" | "approved" | "rejected" | "cancelled"
 *  - tournamentId?: string
 *  - teamId?: string
 *  - userId?: string
 *  - from?: ISO date (created_at >=)
 *  - to?: ISO date (created_at <=)
 *  - search?: string (ilike sur comment, staff_note, source)
 *  - includeUser?: "1" | "true"
 *  - includeTeam?: "1" | "true"
 *  - includeTournament?: "1" | "true"
 *  - limit?: number (default 50)
 *  - offset?: number (default 0)
 *  - orderBy?: "created_at" | "processed_at"
 *  - orderDir?: "asc" | "desc"
 *  - includeTotal?: "1" | "true"
 * ---------------------------------------------------------*/

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse<GetDemandesResponse | { error: string }>
) {
  const {
    type,
    status,
    tournamentId,
    teamId,
    userId,
    from,
    to,
    includeUser,
    includeTeam,
    includeTournament,
    orderBy,
    orderDir,
    includeTotal,
  } = req.query;

  const { limit: limitNum, offset: offsetNum } = parsePagination(req, {
    limit: 50,
  });
  const search = sanitizeSearch(req.query.search);

  const withUser = includeUser === '1' || includeUser === 'true';
  const withTeam = includeTeam === '1' || includeTeam === 'true';
  const withTournament =
    includeTournament === '1' || includeTournament === 'true';

  const orderField = orderBy === 'processed_at' ? 'processed_at' : 'created_at';
  const ascending = orderDir === 'asc' ? true : false;

  const baseColumns = `
    id,
    user_id,
    team_id,
    tournament_id,
    type,
    status,
    comment,
    staff_note,
    processed_by_staff_id,
    processed_at,
    source,
    payload,
    created_at,
    updated_at
  `;

  let select = baseColumns;

  // User data is fetched from Supabase Auth after the main query (no profiles table)

  // Include team data using the explicit foreign key relationship name
  // Requires: demandes_team_id_fkey constraint to be set up in database
  // Run: database/demandes_fix_foreign_keys.sql to create the constraint
  if (withTeam) {
    select += `,
      team:teams!demandes_team_id_fkey(
        id,
        name,
        short_name,
        logo_url
      )
    `;
  }

  // Include tournament data using the explicit foreign key relationship name
  // Requires: demandes_tournament_id_fkey constraint to be set up in database
  if (withTournament) {
    select += `,
      tournament:tournaments!demandes_tournament_id_fkey(
        id,
        name,
        slug
      )
    `;
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  let query = supabaseAdmin.from('demandes').select(select, {
    count:
      includeTotal === '1' || includeTotal === 'true' ? 'exact' : undefined,
  });

  if (type && !Array.isArray(type)) {
    query = query.eq('type', type);
  }

  if (status && !Array.isArray(status)) {
    query = query.eq('status', status);
  }

  if (tournamentId && !Array.isArray(tournamentId)) {
    query = query.eq('tournament_id', tournamentId);
  }

  if (teamId && !Array.isArray(teamId)) {
    query = query.eq('team_id', teamId);
  }

  if (userId && !Array.isArray(userId)) {
    query = query.eq('user_id', userId);
  }

  if (from && !Array.isArray(from)) {
    query = query.gte('created_at', from);
  }

  if (to && !Array.isArray(to)) {
    query = query.lte('created_at', to);
  }

  if (search) {
    const s = `%${escapePostgrestValue(search)}%`;
    query = query.or(
      `comment.ilike.${s},staff_note.ilike.${s},source.ilike.${s}`
    );
  }

  query = query
    .order(orderField, { ascending })
    .range(offsetNum, offsetNum + limitNum - 1);

  const { data, error, count } = await query;

  if (error) {
    logger.error('admin GET demandes error:', error);
    return res.status(500).json({
      error: 'Failed to fetch demandes',
    });
  }

  const safeDemandes = (Array.isArray(data)
    ? data
    : []) as unknown as DemandeWithRelations[];

  // Enrich with user data from Supabase Auth when requested
  if (withUser && safeDemandes.length > 0) {
    const uniqueUserIds = [
      ...new Set(safeDemandes.map((d) => d.user_id).filter(Boolean)),
    ] as string[];

    const userMap = new Map<
      string,
      {
        id: string;
        username: string | null;
        battle_tag: string | null;
        discord: string | null;
      }
    >();

    await Promise.all(
      uniqueUserIds.map(async (uid) => {
        try {
          const { data: userData } =
            await supabaseAdmin!.auth.admin.getUserById(uid);
          if (userData?.user) {
            const meta = userData.user.user_metadata ?? {};
            userMap.set(uid, {
              id: uid,
              username:
                (meta.display_name as string) || userData.user.email || null,
              battle_tag: (meta.battle_tag as string) || null,
              discord: (meta.discord as string) || null,
            });
          }
        } catch {
          // Skip users that can't be fetched
        }
      })
    );

    for (const demande of safeDemandes) {
      if (demande.user_id && userMap.has(demande.user_id)) {
        demande.user = userMap.get(demande.user_id)!;
      }
    }
  }

  return res.status(200).json({
    demandes: safeDemandes,
    total: typeof count === 'number' ? count : null,
  });
}

/* -----------------------------------------------------------
 * POST : batch update de statut
 *
 * Body:
 * {
 *   "action": "updateStatus",
 *   "demandeIds": [ "uuid1", "uuid2", ...],
 *   "newStatus": "approved" | "rejected" | "cancelled" | "pending",
 *   "staffComment": "Optionnel, note interne"
 * }
 * ---------------------------------------------------------*/

async function handlePost(req: NextApiRequest, res: NextApiResponse, ctx: any) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  const body = req.body as PostBody;

  if (!body?.action) {
    return res.status(400).json({
      error: "Missing 'action' in body",
    });
  }

  if (body.action !== 'updateStatus') {
    return res.status(400).json({
      error: 'Unsupported action',
    });
  }

  const { demandeIds, newStatus, staffComment } = body;

  if (!Array.isArray(demandeIds) || demandeIds.length === 0) {
    return res.status(400).json({
      error: "'demandeIds' must be a non-empty array",
    });
  }

  const MAX_BATCH_SIZE = 50;
  if (demandeIds.length > MAX_BATCH_SIZE) {
    return res.status(400).json({
      error: `Batch too large. Maximum ${MAX_BATCH_SIZE} demandes at once.`,
    });
  }

  // Validate every ID is a proper UUID
  for (const id of demandeIds) {
    if (typeof id !== 'string' || !isValidUUID(id)) {
      return res.status(400).json({
        error: `Invalid demande ID format: ${String(id).slice(0, 40)}`,
      });
    }
  }

  const VALID_STATUSES: DemandeStatus[] = [
    'pending',
    'approved',
    'rejected',
    'cancelled',
  ];
  if (!newStatus || !VALID_STATUSES.includes(newStatus)) {
    return res.status(400).json({
      error: `Invalid newStatus. Allowed values: ${VALID_STATUSES.join(', ')}`,
    });
  }

  if (staffComment !== undefined && staffComment !== null) {
    if (typeof staffComment !== 'string' || staffComment.length > 2000) {
      return res.status(400).json({
        error: 'staffComment must be a string with max 2000 characters.',
      });
    }
  }

  const nowIso = new Date().toISOString();
  const staffId: string | null = ctx.staff?.id ?? null;

  // 1) Récupérer l'état avant pour log
  const { data: beforeList, error: fetchErr } = await supabaseAdmin
    .from('demandes')
    .select('*')
    .in('id', demandeIds);

  if (fetchErr) {
    logger.error('admin demandes batch fetch error:', fetchErr);
    return res.status(500).json({
      error: 'Failed to fetch demandes before update',
    });
  }

  // 2) Update
  const updatePayload: Partial<DemandeRow> = {
    status: newStatus,
    processed_at: nowIso,
    processed_by_staff_id: staffId,
  };

  if (typeof staffComment === 'string') {
    // on concatène avec staff_note existant plutôt que d'écraser ?
    // Pour l'instant on écrase, le front peut gérer un historique si besoin.
    updatePayload.staff_note = staffComment;
  }

  const { data: afterList, error: updErr } = await supabaseAdmin
    .from('demandes')
    .update(updatePayload)
    .in('id', demandeIds)
    .select('*');

  if (updErr) {
    logger.error('admin demandes batch update error:', updErr);
    return res.status(500).json({
      error: 'Failed to update demandes',
    });
  }

  // 3) Side-effects: when approving team_registration demandes, create tournament_teams
  if (newStatus === 'approved' && afterList) {
    for (const d of afterList as DemandeRow[]) {
      if (d.type === 'team_registration' && d.team_id && d.tournament_id) {
        // Check if not already registered
        const { data: existingReg } = await supabaseAdmin
          .from('tournament_teams')
          .select('id')
          .eq('tournament_id', d.tournament_id)
          .eq('team_id', d.team_id)
          .maybeSingle();

        if (!existingReg) {
          const { error: regErr } = await supabaseAdmin
            .from('tournament_teams')
            .insert({
              tournament_id: d.tournament_id,
              team_id: d.team_id,
              status: 'registered',
            });

          if (regErr) {
            logger.error('auto-register team_registration error:', regErr);
          } else {
            // Auto news: team approved for tournament
            try {
              const teamName = (d.payload as any)?.team_name || 'Équipe';
              const tournamentName =
                (d.payload as any)?.tournament_name || 'tournoi';
              const { data: teamData } = await supabaseAdmin
                .from('teams')
                .select('logo_url')
                .eq('id', d.team_id)
                .maybeSingle();
              const newsSlug = `tournament-${d.tournament_id}-team-${d.team_id}-${Date.now().toString(36)}`;
              await supabaseAdmin.from('news').insert({
                title: `${teamName} rejoint le tournoi ${tournamentName}`,
                slug: newsSlug,
                tag: 'tournaments',
                excerpt: `${teamName} s'est inscrite au tournoi ${tournamentName}.`,
                content: `L'équipe ${teamName} est désormais inscrite au tournoi ${tournamentName}. Bonne chance !`,
                image_url: teamData?.logo_url ?? null,
                status: 'published',
                published_at: new Date().toISOString(),
              });
            } catch (newsErr) {
              logger.error('[admin/demandes] create news error:', newsErr);
            }
          }
        }
      }
    }
  }

  // 3a-bis) Side-effects: when approving a scrim demande, create a notification
  // demande for the target team (mirrors the captain-driven flow in
  // pages/api/teams/scrim-requests.ts).
  if (newStatus === 'approved' && afterList) {
    for (const d of afterList as DemandeRow[]) {
      if (d.type !== 'scrim') continue;

      const payload = (d.payload as Record<string, any> | null) || {};
      const fromTeamName = payload.from_team_name || 'Équipe inconnue';
      const fromTeamId = payload.from_team_id || null;
      const preferredDate = payload.preferred_date || null;

      let targetTeamName: string | null = payload.target_team_name || null;
      if (!targetTeamName && d.team_id) {
        const { data: targetTeam } = await supabaseAdmin
          .from('teams')
          .select('name')
          .eq('id', d.team_id)
          .maybeSingle();
        targetTeamName = targetTeam?.name ?? null;
      }
      const targetLabel = targetTeamName || 'Équipe cible';

      const dateSuffix = preferredDate
        ? ` (date souhaitée : ${new Date(preferredDate).toLocaleDateString('fr-FR')})`
        : '';
      const commentSuffix = d.comment ? ` — "${d.comment}"` : '';

      const { error: notifErr } = await supabaseAdmin.from('demandes').insert({
        user_id: null,
        team_id: d.team_id,
        type: 'other',
        status: 'pending',
        source: 'website',
        comment:
          `Scrim accepté : ${fromTeamName} vs ${targetLabel}` +
          dateSuffix +
          commentSuffix,
        payload: {
          notification_type: 'scrim_accepted',
          from_team_id: fromTeamId,
          from_team_name: fromTeamName,
          target_team_id: d.team_id,
          target_team_name: targetLabel,
          preferred_date: preferredDate,
          original_demande_id: d.id,
        },
      });

      if (notifErr) {
        logger.error('admin scrim accept notification error:', notifErr);
      }
    }
  }

  // 3b) Side-effects: when approving join demandes, add player to team
  if (newStatus === 'approved' && afterList) {
    for (const d of afterList as DemandeRow[]) {
      if (d.type === 'join' && d.team_id && d.user_id) {
        // Check if not already a member
        const { data: existingMember } = await supabaseAdmin
          .from('team_members')
          .select('id')
          .eq('team_id', d.team_id)
          .eq('user_id', d.user_id)
          .maybeSingle();

        if (!existingMember) {
          const desiredRole = (d.payload as any)?.desired_role || 'player';
          const battleTag = (d.payload as any)?.user_battle_tag || null;

          const { error: memberErr } = await supabaseAdmin
            .from('team_members')
            .insert({
              team_id: d.team_id,
              user_id: d.user_id,
              role: desiredRole,
              battle_tag: battleTag,
            });

          if (memberErr) {
            logger.error('auto-add join member error:', memberErr);
          } else {
            try {
              const playerName =
                battleTag?.split('#')[0] ||
                (d.payload as any)?.user_display_name ||
                'Joueur';
              const teamName = (d.payload as any)?.team_name || 'Équipe';
              const { data: teamData } = await supabaseAdmin
                .from('teams')
                .select('logo_url')
                .eq('id', d.team_id)
                .maybeSingle();
              const newsSlug = `team-${d.team_id}-join-${Date.now().toString(36)}`;
              await supabaseAdmin.from('news').insert({
                title: `${playerName} rejoint ${teamName}`,
                slug: newsSlug,
                tag: 'teams',
                excerpt: `${playerName} rejoint ${teamName} en tant que ${desiredRole}.`,
                content: `${playerName} a rejoint ${teamName} en tant que ${desiredRole}. Bienvenue !`,
                image_url: teamData?.logo_url ?? null,
                status: 'published',
                published_at: new Date().toISOString(),
              });
            } catch (newsErr) {
              logger.error('[admin/demandes] join news error:', newsErr);
            }
          }
        }
      }
    }
  }

  // 4) Log staff (batch)
  if (staffId) {
    try {
      await logStaffAction({
        staff_id: staffId,
        action: 'staff_batch_action',
        entity_type: 'demande',
        entity_id: demandeIds.length === 1 ? demandeIds[0] : null,
        tournament_id: null,
        payload: {
          demande_ids: demandeIds,
          new_status: newStatus,
          staff_comment: staffComment ?? null,
          before: beforeList,
          after: afterList,
        },
      });
    } catch (e) {
      logger.error('admin demandes batch logStaffAction error:', e);
    }
  }

  return res.status(200).json({
    success: true,
    updatedCount: afterList?.length ?? 0,
    demandes: afterList,
  });
}
