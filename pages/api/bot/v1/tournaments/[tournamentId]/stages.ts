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
import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import {
  discordIdSchema,
  uuidSchema,
  slugSchema,
  isoDateSchema,
  boundedString,
} from '@/utils/botValidation';
import { logger } from '@/utils/logger';

const VALID_STAGE_TYPES = [
  'group',
  'bracket',
  'swiss',
  'round_robin',
  'showmatch',
  'other',
] as const;

// Le handler accepte les deux casses (snake_case + camelCase) pour
// stage_type / order_index / is_public / is_active. Le schéma valide chaque
// alias indépendamment ; la résolution alias→valeur reste dans le handler
// pour préserver exactement la priorité historique (snake_case d'abord).
const orderIndexSchema = z.number().int().min(0);
const createStageBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  name: boundedString(1, 255),
  stage_type: z.enum(VALID_STAGE_TYPES).optional(),
  stageType: z.enum(VALID_STAGE_TYPES).optional(),
  slug: slugSchema.optional(),
  start_date: isoDateSchema.optional(),
  end_date: isoDateSchema.optional(),
  order_index: orderIndexSchema.optional(),
  orderIndex: orderIndexSchema.optional(),
  is_public: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  is_active: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
const createStageQuerySchema = z.object({ tournamentId: uuidSchema });

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { tournamentId } = req.botQuery as z.infer<
    typeof createStageQuerySchema
  >;

  const actor = await requireBotStaff(req, res, req.body ?? {});
  if (!actor) return;

  const input = req.botInput as z.infer<typeof createStageBodySchema>;

  const name = input.name;

  const stageType = input.stage_type ?? input.stageType ?? 'other';

  const startDate = input.start_date ?? null;
  const endDate = input.end_date ?? null;
  if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
    return res
      .status(400)
      .json({ error: 'start_date doit être avant end_date' });
  }

  let orderIndex: number | null = input.order_index ?? input.orderIndex ?? null;

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

  const slug = input.slug
    ? slugify(input.slug, { lower: true, strict: true })
    : slugify(name, { lower: true, strict: true });

  const isPublic = input.is_public === true || input.isPublic === true;
  const isActive = input.is_active === true || input.isActive === true;

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
  bodySchema: createStageBodySchema,
  querySchema: createStageQuerySchema,
});
