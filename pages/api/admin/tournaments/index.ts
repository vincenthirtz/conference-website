// pages/api/admin/tournaments/index.ts
// Admin: gestion des tournois
// - GET  : liste des tournois avec filtres + pagination
// - POST : création d'un tournoi (minimal)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { parsePagination, sanitizeSearch } from '@/utils/apiHelpers';
import slugify from 'slugify';
import { OVERWATCH_MAPS } from '@/config/overwatch-maps';

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
  } catch (err: unknown) {
    console.error('[/api/admin/tournaments] internal error:', err);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
}

/* -----------------------------------------------------------
 * GET : liste des tournois admin
 * ---------------------------------------------------------*/

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { status, orderBy, orderDir, includeTotal, dateFrom, dateTo } =
    req.query;

  const { limit: limitNum, offset: offsetNum } = parsePagination(req, {
    limit: 50,
  });
  const search = sanitizeSearch(req.query.search);

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
    count:
      includeTotal === '1' || includeTotal === 'true' ? 'exact' : undefined,
  });

  if (status && !Array.isArray(status)) {
    query = query.eq('status', status);
  }

  if (search) {
    const s = `%${search}%`;
    query = query.or(`name.ilike.${s},slug.ilike.${s}`);
  }

  if (dateFrom && !Array.isArray(dateFrom)) {
    query = query.gte('start_date', dateFrom);
  }

  if (dateTo && !Array.isArray(dateTo)) {
    query = query.lte('start_date', dateTo);
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

  // Vérifier l'unicité du slug
  const { data: existing } = await supabaseAdmin!
    .from('tournaments')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (existing) {
    return res.status(409).json({
      error: `Un tournoi avec le slug "${slug}" existe déjà. Choisissez un nom ou slug différent.`,
    });
  }

  // Validation des dates
  if (body.start_date && isNaN(Date.parse(body.start_date))) {
    return res.status(400).json({ error: 'start_date is not a valid date' });
  }
  if (body.end_date && isNaN(Date.parse(body.end_date))) {
    return res.status(400).json({ error: 'end_date is not a valid date' });
  }
  if (
    body.start_date &&
    body.end_date &&
    new Date(body.start_date) >= new Date(body.end_date)
  ) {
    return res
      .status(400)
      .json({ error: 'start_date must be before end_date' });
  }

  // Validation max_teams
  if (body.max_teams !== undefined && body.max_teams !== null) {
    if (
      typeof body.max_teams !== 'number' ||
      !Number.isInteger(body.max_teams) ||
      body.max_teams < 1
    ) {
      return res
        .status(400)
        .json({ error: 'max_teams must be an integer >= 1' });
    }
  }

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

  // Auto-ajouter toutes les maps OW au pool du tournoi
  try {
    const mapRows = OVERWATCH_MAPS.map((m, idx) => ({
      tournament_id: data.id,
      map_name: m.name,
      map_slug: slugify(m.name, { lower: true, strict: true }),
      map_type: m.type,
      image_url: m.image,
      enabled: true,
      order_index: idx,
    }));

    const { error: mapsErr } = await supabaseAdmin!
      .from('tournament_maps')
      .insert(mapRows);

    if (mapsErr) {
      console.error('Auto-insert tournament_maps error:', mapsErr);
    }
  } catch (mapsInsertErr) {
    console.error('Auto-insert tournament_maps exception:', mapsInsertErr);
  }

  return res.status(201).json({ tournament: data });
}
