// @ts-nocheck
// pages/api/admin/demandes/index.ts
// Admin: gestion des demandes (join/leave, etc.)
// - GET  : liste filtrable/paginée des demandes
// - POST : batch update du statut de plusieurs demandes

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';

export type DemandeType = 'join' | 'leave' | 'captain_request' | 'other';

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
  } catch (err: any) {
    console.error('[/api/admin/demandes] internal error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      detail: err?.message,
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
    search,
    includeUser,
    includeTeam,
    includeTournament,
    limit,
    offset,
    orderBy,
    orderDir,
    includeTotal,
  } = req.query;

  const limitNum = parseInt(
    (Array.isArray(limit) ? limit[0] : limit) ?? '50',
    10
  );
  const offsetNum = parseInt(
    (Array.isArray(offset) ? offset[0] : offset) ?? '0',
    10
  );

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

  // Note: profiles table doesn't exist, so we skip user data for now
  // The user_id is still included in baseColumns
  if (withUser) {
    // TODO: Create profiles table or fetch user data separately
    // For now, we skip the user join to avoid errors
  }

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

  if (search && !Array.isArray(search)) {
    const s = `%${search}%`;
    query = query.or(
      `comment.ilike.${s},staff_note.ilike.${s},source.ilike.${s}`
    );
  }

  query = query
    .order(orderField, { ascending })
    .range(offsetNum, offsetNum + limitNum - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('admin GET demandes error:', error);
    return res.status(500).json({
      error: 'Failed to fetch demandes',
    });
  }

  const safeDemandes = (Array.isArray(data)
    ? data
    : []) as unknown as DemandeWithRelations[];

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

  if (!newStatus) {
    return res.status(400).json({
      error: "Missing 'newStatus'",
    });
  }

  const nowIso = new Date().toISOString();
  const staffId: string | null = ctx.staff?.id ?? null;

  // 1) Récupérer l'état avant pour log
  const { data: beforeList, error: fetchErr } = await supabaseAdmin
    .from('demandes')
    .select('*')
    .in('id', demandeIds);

  if (fetchErr) {
    console.error('admin demandes batch fetch error:', fetchErr);
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
    console.error('admin demandes batch update error:', updErr);
    return res.status(500).json({
      error: 'Failed to update demandes',
    });
  }

  // 3) Log staff (batch)
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
      console.error('admin demandes batch logStaffAction error:', e);
    }
  }

  return res.status(200).json({
    success: true,
    updatedCount: afterList?.length ?? 0,
    demandes: afterList,
  });
}
