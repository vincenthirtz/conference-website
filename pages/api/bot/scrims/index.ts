// /api/bot/scrims
//
// GET  — liste les scrims non-draft (lecture seule).
// POST — cree un scrim. Reserve aux staff admin/owner via actorDiscordUserId.
//
// Auth: x-api-key valide contre BOT_API_KEY.

import crypto from 'crypto';
import slugify from 'slugify';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '../../../../utils/logger';

const VALID_STATUSES = [
  'draft',
  'scheduled',
  'running',
  'completed',
  'cancelled',
] as const;

function verifyBotApiKey(req: NextApiRequest): boolean {
  const expected = process.env.BOT_API_KEY;
  if (!expected) return false;
  const provided = req.headers['x-api-key'];
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function resolveActorStaff(
  discordUserId: string
): Promise<{ staffId: string | null; role: string | null }> {
  if (!supabaseAdmin) return { staffId: null, role: null };
  const { data: link } = await supabaseAdmin
    .from('user_discord_links')
    .select('auth_user_id')
    .eq('discord_user_id', discordUserId)
    .maybeSingle();
  if (!link) return { staffId: null, role: null };
  const { data: staff } = await supabaseAdmin
    .from('staff')
    .select('id, role')
    .eq('auth_user_id', link.auth_user_id)
    .maybeSingle();
  return { staffId: staff?.id ?? null, role: staff?.role ?? null };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'bot-scrims'))
    return;

  if (!process.env.BOT_API_KEY) {
    logger.error('[bot/scrims] BOT_API_KEY is unset');
    return res.status(500).json({ error: 'Endpoint not configured.' });
  }
  if (!verifyBotApiKey(req)) {
    return res.status(401).json({ error: 'Invalid or missing API key.' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database unavailable.' });
  }

  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
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

  const actorDiscordUserId =
    typeof body.actorDiscordUserId === 'string'
      ? body.actorDiscordUserId.trim()
      : '';
  if (!/^[0-9]{15,25}$/.test(actorDiscordUserId)) {
    return res.status(400).json({ error: 'actorDiscordUserId requis' });
  }

  const actor = await resolveActorStaff(actorDiscordUserId);
  if (!actor.role || (actor.role !== 'admin' && actor.role !== 'owner')) {
    return res.status(403).json({
      error:
        "Action reservee aux admins/owners. Ton compte Discord n'est pas lie a un staff de ce niveau.",
    });
  }

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

  if (actor.staffId) {
    try {
      await logStaffAction({
        staff_id: actor.staffId,
        action: 'other',
        entity_type: 'scrim',
        entity_id: data.id,
        tournament_id: null,
        payload: {
          subject: 'create_scrim',
          name: data.name,
          slug: data.slug,
          via: 'discord_bot',
        },
      });
    } catch (e) {
      logger.error('[bot/scrims] log error', e);
    }
  }

  return res.status(201).json({ scrim: data });
}
