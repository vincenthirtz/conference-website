// /api/bot/v1/tournaments
//
// GET  — list non-draft tournaments (anyone with BOT_API_KEY can read).
// POST — create a tournament. Restricted to staff with role admin or owner;
//        the bot must pass `actorDiscordUserId` so the server can map back
//        to a staff row via user_discord_links.
//
// Auth: x-api-key validated against BOT_API_KEY.

import slugify from 'slugify';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import { OVERWATCH_MAPS } from '@/config/overwatch-maps';
import { logger } from '@/utils/logger';

const VALID_STATUSES = [
  'draft',
  'published',
  'running',
  'completed',
  'archived',
  'cancelled',
] as const;
type Status = (typeof VALID_STATUSES)[number];

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') return handleList(req, res);
  return handleCreate(req, res);
}

async function handleList(req: NextApiRequest, res: NextApiResponse) {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const statusQ = req.query.status;
  const includeDrafts =
    req.query.includeDrafts === '1' || req.query.includeDrafts === 'true';

  let query = supabaseAdmin!
    .from('tournaments')
    .select(
      'id, name, slug, game, status, start_date, end_date, max_teams, created_at'
    )
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (typeof statusQ === 'string' && statusQ) {
    if (!(VALID_STATUSES as readonly string[]).includes(statusQ)) {
      return res.status(400).json({
        error: `Statut invalide. Valeurs : ${VALID_STATUSES.join(', ')}.`,
      });
    }
    query = query.eq('status', statusQ);
  } else if (!includeDrafts) {
    // Default: hide drafts from bot consumers.
    query = query.neq('status', 'draft');
  }

  const { data, error } = await query;
  if (error) {
    logger.error('[bot/tournaments] list error', error);
    return res.status(500).json({ error: 'Failed to list tournaments' });
  }
  return res.status(200).json({ tournaments: data ?? [] });
}

async function handleCreate(req: NextApiRequest, res: NextApiResponse) {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const actor = await requireBotStaff(req, res, body);
  if (!actor) return;

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return res.status(400).json({ error: "Field 'name' is required" });
  }

  const slug =
    typeof body.slug === 'string' && body.slug.trim().length > 0
      ? body.slug.trim()
      : slugify(name, { lower: true, strict: true });

  // Slug uniqueness check (mirrors the admin endpoint behaviour).
  const { data: existing } = await supabaseAdmin!
    .from('tournaments')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (existing) {
    return res.status(409).json({
      error: `Un tournoi avec le slug "${slug}" existe déjà.`,
    });
  }

  const startDate =
    typeof body.start_date === 'string' ? body.start_date : null;
  const endDate = typeof body.end_date === 'string' ? body.end_date : null;
  if (startDate && Number.isNaN(Date.parse(startDate))) {
    return res.status(400).json({ error: 'start_date is not a valid date' });
  }
  if (endDate && Number.isNaN(Date.parse(endDate))) {
    return res.status(400).json({ error: 'end_date is not a valid date' });
  }
  if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
    return res
      .status(400)
      .json({ error: 'start_date must be before end_date' });
  }

  const rawStatus =
    typeof body.status === 'string' && body.status ? body.status : 'draft';
  if (!(VALID_STATUSES as readonly string[]).includes(rawStatus)) {
    return res.status(400).json({
      error: `Statut invalide. Valeurs : ${VALID_STATUSES.join(', ')}.`,
    });
  }

  let maxTeams: number | null = null;
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
    maxTeams = body.max_teams;
  }

  const payload = {
    name,
    slug,
    game: typeof body.game === 'string' ? body.game : null,
    status: rawStatus as Status,
    start_date: startDate,
    end_date: endDate,
    max_teams: maxTeams,
  };

  const { data, error } = await supabaseAdmin!
    .from('tournaments')
    .insert(payload)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    logger.error('[bot/tournaments] create error', error);
    return res.status(500).json({ error: 'Failed to create tournament' });
  }

  await logBotStaffAction({
    staffId: actor.staffId,
    action: 'create_tournament',
    entity_type: 'tournament',
    entity_id: data.id,
    tournament_id: data.id,
    payload: { name: data.name, slug: data.slug },
  });

  // Auto-populate the tournament map pool with OW maps (parity with admin POST).
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
      logger.error('[bot/tournaments] auto-insert maps error', mapsErr);
    }
  } catch (e) {
    logger.error('[bot/tournaments] auto-insert maps exception', e);
  }

  return res.status(201).json({ tournament: data });
}

export default withBotRoute(handler, {
  methods: ['GET', 'POST'],
  rateLimit: { max: 60, key: 'bot-tournaments' },
  idempotent: true,
});
