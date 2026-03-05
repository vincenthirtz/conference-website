// pages/api/admin/tournaments/index.ts
// Admin: gestion des tournois
// - GET  : liste des tournois avec filtres + pagination
// - POST : création d'un tournoi (minimal)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import slugify from 'slugify';

export type TournamentRow = {
  id: string;
  name: string;
  slug: string | null;
  game: string | null;
  status: string | null; // "draft" | "published" | ...
  start_date: string | null;
  end_date: string | null;
  max_teams: number | null;
  created_at: string;
  updated_at: string | null;
};

export type TournamentCreateInput = {
  name: string;
  slug?: string | null;
  game?: string | null;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  max_teams?: number | null;
};

// Rôle minimum : manager (gestion tournois)
export default withStaffRoute(handler, 'manager');

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
    console.error('[/api/admin/tournaments] internal error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      detail: err?.message,
    });
  }
}

/* -----------------------------------------------------------
 * GET : liste des tournois admin
 * ---------------------------------------------------------*/

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { status, search, limit, offset, orderBy, orderDir, includeTotal } =
    req.query;

  const limitNum = parseInt(
    (Array.isArray(limit) ? limit[0] : limit) ?? '50',
    10
  );
  const offsetNum = parseInt(
    (Array.isArray(offset) ? offset[0] : offset) ?? '0',
    10
  );

  const orderByParam = Array.isArray(orderBy) ? orderBy[0] : orderBy;
  const orderByField =
    orderByParam === 'start_date' || orderByParam === 'start_date'
      ? 'start_date'
      : 'created_at';

  const orderDirection =
    orderDir === 'asc' ? { ascending: true } : { ascending: false };

  const selectColumns = `
    id,
    name,
    slug,
    game,
    status,
    start_date,
    end_date,
    max_teams,
    created_at,
    updated_at
  `;

  let query = supabaseAdmin!.from('tournaments').select(selectColumns, {
    count: includeTotal === '1' || includeTotal === 'true' ? 'exact' : undefined,
  });

  if (status && !Array.isArray(status)) {
    query = query.eq('status', status);
  }

  if (search && !Array.isArray(search)) {
    const s = `%${search}%`;
    query = query.or(`name.ilike.${s},slug.ilike.${s}`);
  }

  query = query
    .order(orderByField, orderDirection)
    .range(offsetNum, offsetNum + limitNum - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('admin GET tournaments error:', error);
    return res.status(500).json({
      error: 'Failed to fetch tournaments',
    });
  }

  return res.status(200).json({
    tournaments: (data || []) as TournamentRow[],
    total: typeof count === 'number' ? count : null,
  });
}

/* -----------------------------------------------------------
 * POST : créer un nouveau tournoi
 * Body: TournamentCreateInput
 * ---------------------------------------------------------*/

async function handlePost(req: NextApiRequest, res: NextApiResponse, ctx: any) {
  const body = req.body as TournamentCreateInput;

  if (!body?.name) {
    return res.status(400).json({
      error: "Field 'name' is required",
    });
  }

  const slug =
    typeof body.slug === 'string' && body.slug.trim().length > 0
      ? body.slug.trim()
      : slugify(body.name, { lower: true, strict: true });

  const payload = {
    name: body.name,
    slug,
    game: body.game ?? null,
    status: body.status ?? 'draft',
    start_date: body.start_date ?? null,
    end_date: body.end_date ?? null,
    max_teams: body.max_teams ?? null,
  };

  const { data, error } = await supabaseAdmin!
    .from('tournaments')
    .insert(payload)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    console.error('admin POST tournaments error:', error);
    return res.status(500).json({
      error: 'Failed to create tournament',
    });
  }

  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'create_tournament',
        entity_type: 'tournament',
        entity_id: data.id,
        tournament_id: data.id,
        payload: { name: data.name, slug: data.slug },
      });
    } catch (logErr) {
      console.error('logStaffAction(create_tournament) error:', logErr);
    }
  }

  return res.status(201).json({ tournament: data });
}
