// POST /api/bot/tournaments/[tournamentId]/stages
//
// Create a stage inside a tournament via the Discord bot.
// Admin-only: actorDiscordUserId must map (user_discord_links → staff) to
// a staff with role admin or owner.
//
// Settings (the complex JSON config per stage_type) are intentionally
// omitted from this bot path — staff can fine-tune them in the admin UI
// after the bot creates the bare stage.

import crypto from 'crypto';
import slugify from 'slugify';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '../../../../../utils/logger';

const VALID_STAGE_TYPES = [
  'group',
  'bracket',
  'swiss',
  'round_robin',
  'showmatch',
  'other',
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
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'bot-stages')
  )
    return;

  if (!process.env.BOT_API_KEY) {
    logger.error('[bot/stages] BOT_API_KEY is unset');
    return res.status(500).json({ error: 'Endpoint not configured.' });
  }
  if (!verifyBotApiKey(req)) {
    return res.status(401).json({ error: 'Invalid or missing API key.' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database unavailable.' });
  }

  const { tournamentId } = req.query;
  if (
    !tournamentId ||
    Array.isArray(tournamentId) ||
    !isValidUUID(tournamentId)
  ) {
    return res.status(400).json({ error: 'tournamentId invalide' });
  }

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
        "Action réservée aux admins/owners. Ton compte Discord n'est pas lié à un staff de ce niveau.",
    });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return res.status(400).json({ error: 'name requis' });
  }

  const stageType =
    typeof body.stage_type === 'string' && body.stage_type
      ? body.stage_type
      : typeof body.stageType === 'string' && body.stageType
        ? body.stageType
        : 'other';
  if (!(VALID_STAGE_TYPES as readonly string[]).includes(stageType)) {
    return res.status(400).json({
      error: `stage_type invalide. Valeurs : ${VALID_STAGE_TYPES.join(', ')}.`,
    });
  }

  const startDate =
    typeof body.start_date === 'string' ? body.start_date : null;
  const endDate = typeof body.end_date === 'string' ? body.end_date : null;
  if (startDate && Number.isNaN(Date.parse(startDate))) {
    return res.status(400).json({ error: 'start_date invalide' });
  }
  if (endDate && Number.isNaN(Date.parse(endDate))) {
    return res.status(400).json({ error: 'end_date invalide' });
  }
  if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
    return res
      .status(400)
      .json({ error: 'start_date doit être avant end_date' });
  }

  let orderIndex =
    typeof body.order_index === 'number'
      ? body.order_index
      : typeof body.orderIndex === 'number'
        ? body.orderIndex
        : null;
  if (
    orderIndex !== null &&
    (!Number.isInteger(orderIndex) || orderIndex < 0)
  ) {
    return res.status(400).json({ error: 'order_index doit être un entier >= 0' });
  }

  // Verify tournament exists
  const { data: tournament } = await supabaseAdmin
    .from('tournaments')
    .select('id')
    .eq('id', tournamentId)
    .maybeSingle();
  if (!tournament) {
    return res.status(404).json({ error: 'Tournoi introuvable' });
  }

  // Auto-compute next order_index if not provided.
  if (orderIndex === null) {
    const { data: lastStage } = await supabaseAdmin
      .from('tournament_stages')
      .select('order_index')
      .eq('tournament_id', tournamentId)
      .order('order_index', { ascending: false })
      .limit(1)
      .maybeSingle();
    const max = typeof lastStage?.order_index === 'number' ? lastStage.order_index : -1;
    orderIndex = max + 1;
  }

  const slug =
    typeof body.slug === 'string' && body.slug.trim()
      ? slugify(body.slug.trim(), { lower: true, strict: true })
      : slugify(name, { lower: true, strict: true });

  const isPublic = body.is_public === true || body.isPublic === true;
  const isActive = body.is_active === true || body.isActive === true;

  const { data: stage, error } = await supabaseAdmin
    .from('tournament_stages')
    .insert({
      tournament_id: tournamentId,
      name,
      slug,
      stage_type: stageType,
      order_index: orderIndex,
      is_public: isPublic,
      is_active: isActive,
      start_date: startDate,
      end_date: endDate,
      settings: null,
    })
    .select('*')
    .single();

  if (error || !stage) {
    logger.error('[bot/stages] create error', error);
    return res.status(500).json({ error: 'Échec de création de la phase' });
  }

  if (actor.staffId) {
    try {
      await logStaffAction({
        staff_id: actor.staffId,
        action: 'create_stage',
        entity_type: 'stage',
        entity_id: stage.id,
        tournament_id: tournamentId,
        payload: {
          name: stage.name,
          stage_type: stage.stage_type,
          order_index: stage.order_index,
          via: 'discord_bot',
        },
      });
    } catch (e) {
      logger.error('[bot/stages] log error', e);
    }
  }

  return res.status(201).json({ stage });
}
