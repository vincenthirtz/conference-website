// /api/bot/v1/scrims
//
// GET  — liste les scrims non-draft (lecture seule).
// POST — cree un scrim. Reserve aux staff admin/owner via actorDiscordUserId.
//
// Auth: x-api-key valide contre BOT_API_KEY.

import slugify from 'slugify';
import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import {
  discordIdSchema,
  uuidSchema,
  gameSlugSchema,
  isoDateSchema,
} from '@/utils/botValidation';
import { logger } from '@/utils/logger';
import {
  notifyAdminScrimEmails,
  formatScrimDateFr,
} from '@/utils/scrimRequestNotify';

const VALID_STATUSES = [
  'draft',
  'scheduled',
  'running',
  'completed',
  'cancelled',
] as const;

const statusEnum = z.enum(VALID_STATUSES);

// POST body. team1_id/team2_id distincts via .refine (préserve le check inline).
// `slug` reste une string libre bornée (PAS slugSchema) : le handler historique
// n'appliquait aucun regex sur un slug fourni, slugify n'agissant que sur le
// fallback auto-généré. On préserve cette sémantique.
const scrimCreateBodySchema = z
  .object({
    actorDiscordUserId: discordIdSchema,
    name: z
      .string()
      .transform((s) => s.trim())
      .refine((s) => s.length > 0, "Field 'name' is required")
      .pipe(z.string().max(255)),
    slug: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().max(120))
      .optional(),
    status: statusEnum.optional(),
    team1_id: uuidSchema.nullish(),
    team2_id: uuidSchema.nullish(),
    scheduled_date: isoDateSchema.nullish(),
    game: gameSlugSchema.nullish(),
    is_public: z
      .union([z.boolean(), z.literal('true'), z.literal('false')])
      .optional(),
  })
  .refine((b) => !(b.team1_id && b.team2_id && b.team1_id === b.team2_id), {
    message: 'team1_id et team2_id doivent etre distincts',
    path: ['team2_id'],
  });

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  if (req.method === 'GET') return handleList(req, res);
  return handleCreate(req, res);
}

async function handleList(req: BotTenantRequest, res: NextApiResponse) {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const statusQ = req.query.status;
  const includeDrafts =
    req.query.includeDrafts === '1' || req.query.includeDrafts === 'true';

  let query = supabaseAdmin!
    .from('scrims')
    .select(
      'id, name, slug, game, status, team1_id, team2_id, scheduled_date, is_public, created_at'
    )
    .eq('tenant_id', req.botContext.tenantId)
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

async function handleCreate(req: BotTenantRequest, res: NextApiResponse) {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const input = req.botInput as z.infer<typeof scrimCreateBodySchema>;

  const actor = await requireBotStaff(req, res, body);
  if (!actor) return;

  const name = input.name;

  const slug =
    input.slug && input.slug.length > 0
      ? input.slug
      : slugify(`${name}-${Date.now().toString(36)}`, {
          lower: true,
          strict: true,
        });

  const { data: existing } = await supabaseAdmin!
    .from('scrims')
    .select('id')
    .eq('tenant_id', req.botContext.tenantId)
    .eq('slug', slug)
    .maybeSingle();
  if (existing) {
    return res.status(409).json({
      error: `Un scrim avec le slug "${slug}" existe deja.`,
    });
  }

  const status = input.status ?? 'draft';
  const team1Id = input.team1_id ?? null;
  const team2Id = input.team2_id ?? null;
  const scheduledDate = input.scheduled_date ?? null;

  const payload = {
    tenant_id: req.botContext.tenantId,
    name,
    slug,
    game: input.game ?? null,
    status,
    team1_id: team1Id,
    team2_id: team2Id,
    scheduled_date: scheduledDate,
    is_public: input.is_public === true || input.is_public === 'true',
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

  // Effet de bord best-effort : dès que les deux équipes sont connues (même en
  // draft), on notifie par email les capitaines des DEUX équipes. S'ajoute à la
  // notif Discord ; fire-and-forget → ne modifie jamais la réponse 201.
  if (team1Id && team2Id) {
    void notifyAdminScrimEmails({
      tenantId: req.botContext.tenantId,
      team1Id,
      team2Id,
      dateLabel: formatScrimDateFr(input.scheduled_date ?? null),
    }).catch(() => {});
  }

  return res.status(201).json({ scrim: data });
}

export default withBotRoute(handler, {
  methods: ['GET', 'POST'],
  rateLimit: { max: 60, key: 'bot-scrims' },
  idempotent: true,
  // bodySchema ne s'applique qu'aux méthodes non-safe (POST). Le GET (liste)
  // lit req.query directement — pas de querySchema pour ne pas contraindre le
  // POST (qui n'a pas de query).
  bodySchema: scrimCreateBodySchema,
});
