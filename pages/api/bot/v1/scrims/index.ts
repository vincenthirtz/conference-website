// /api/bot/v1/scrims
//
// GET  — liste les scrims non-draft (lecture seule).
// POST — cree un scrim. Reserve aux staff admin/owner via actorDiscordUserId.
//
// Auth: x-api-key valide contre BOT_API_KEY.

import slugify from 'slugify';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const VALID_STATUSES = [
  'draft',
  'scheduled',
  'running',
  'completed',
  'cancelled',
] as const;

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
    .from('scrims')
    .select(
      'id, name, slug, game, status, team1_id, team2_id, scheduled_date, is_public, created_at'
    )
    .eq('tenant_id', req.botContext!.tenantId)
    .order('scheduled_date', { ascending: false, nullsFirst: false })
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
    query = query.neq('status', 'draft');
  }

  const { data, error } = await query;
  if (error) {
    logger.error('[bot/scrims] list error', error);
    return res.status(500).json({ error: 'Failed to list scrims' });
  }
  return res.status(200).json({ scrims: data ?? [] });
}

async function handleCreate(req: NextApiRequest, res: NextApiResponse) {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const actor = await requireBotStaff(req, res, body);
  if (!actor) return;

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return res.status(400).json({ error: "Field 'name' is required" });

  const slug =
    typeof body.slug === 'string' && body.slug.trim().length > 0
      ? body.slug.trim()
      : slugify(`${name}-${Date.now().toString(36)}`, {
          lower: true,
          strict: true,
        });

  const { data: existing } = await supabaseAdmin!
    .from('scrims')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (existing) {
    return res.status(409).json({
      error: `Un scrim avec le slug "${slug}" existe deja.`,
    });
  }

  const status =
    typeof body.status === 'string' && body.status ? body.status : 'draft';
  if (!(VALID_STATUSES as readonly string[]).includes(status)) {
    return res.status(400).json({
      error: `Statut invalide. Valeurs : ${VALID_STATUSES.join(', ')}.`,
    });
  }

  const team1Id =
    typeof body.team1_id === 'string' ? (body.team1_id as string) : null;
  const team2Id =
    typeof body.team2_id === 'string' ? (body.team2_id as string) : null;
  if (team1Id && !isValidUUID(team1Id))
    return res.status(400).json({ error: 'team1_id invalide' });
  if (team2Id && !isValidUUID(team2Id))
    return res.status(400).json({ error: 'team2_id invalide' });
  if (team1Id && team2Id && team1Id === team2Id)
    return res
      .status(400)
      .json({ error: 'team1_id et team2_id doivent etre distincts' });

  const scheduledDate =
    typeof body.scheduled_date === 'string' ? body.scheduled_date : null;
  if (scheduledDate && Number.isNaN(Date.parse(scheduledDate))) {
    return res.status(400).json({ error: 'scheduled_date invalide' });
  }

  const payload = {
    name,
    slug,
    game: typeof body.game === 'string' ? body.game : null,
    status,
    team1_id: team1Id,
    team2_id: team2Id,
    scheduled_date: scheduledDate,
    is_public: body.is_public === true || body.is_public === 'true',
  };

  const { data, error } = await supabaseAdmin!
    .from('scrims')
    .insert(payload)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    logger.error('[bot/scrims] create error', error);
    return res.status(500).json({ error: 'Failed to create scrim' });
  }

  await logBotStaffAction({
    staffId: actor.staffId,
    action: 'other',
    entity_type: 'scrim',
    entity_id: data.id,
    payload: {
      subject: 'create_scrim',
      name: data.name,
      slug: data.slug,
    },
  });

  return res.status(201).json({ scrim: data });
}

export default withBotRoute(handler, {
  methods: ['GET', 'POST'],
  rateLimit: { max: 60, key: 'bot-scrims' },
  idempotent: true,
});
