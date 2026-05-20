// POST /api/bot/v1/tournaments/[tournamentId]/stages
//
// Create a stage inside a tournament via the Discord bot.
// Admin-only: actorDiscordUserId must map (user_discord_links → staff) to
// a staff with role admin or owner.
//
// Settings (the complex JSON config per stage_type) are intentionally
// omitted from this bot path — staff can fine-tune them in the admin UI
// after the bot creates the bare stage.

import slugify from 'slugify';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const VALID_STAGE_TYPES = [
  'group',
  'bracket',
  'swiss',
  'round_robin',
  'showmatch',
  'other',
] as const;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { tournamentId } = req.query;
  if (
    !tournamentId ||
    Array.isArray(tournamentId) ||
    !isValidUUID(tournamentId)
  ) {
    return res.status(400).json({ error: 'tournamentId invalide' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const actor = await requireBotStaff(req, res, body);
  if (!actor) return;

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
    return res
      .status(400)
      .json({ error: 'order_index doit être un entier >= 0' });
  }

  // Verify tournament exists
  const { data: tournament } = await supabaseAdmin
    .from('tournaments')
    .select('id')
    .eq('tenant_id', req.botContext!.tenantId)
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
      .eq('tenant_id', req.botContext!.tenantId)
      .eq('tournament_id', tournamentId)
      .order('order_index', { ascending: false })
      .limit(1)
      .maybeSingle();
    const max =
      typeof lastStage?.order_index === 'number' ? lastStage.order_index : -1;
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
      tenant_id: req.botContext!.tenantId,
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

  await logBotStaffAction({
    staffId: actor.staffId,
    action: 'create_stage',
    entity_type: 'stage',
    entity_id: stage.id,
    tournament_id: tournamentId,
    payload: {
      name: stage.name,
      stage_type: stage.stage_type,
      order_index: stage.order_index,
    },
  });

  return res.status(201).json({ stage });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 30, key: 'bot-stages' },
  idempotent: true,
});
