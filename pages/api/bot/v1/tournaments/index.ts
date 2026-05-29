// /api/bot/v1/tournaments
//
// GET  — list non-draft tournaments (anyone with BOT_API_KEY can read).
// POST — create a tournament. Restricted to staff with role admin or owner;
//        the bot must pass `actorDiscordUserId` so the server can map back
//        to a staff row via user_discord_links.
//
// Auth: x-api-key validated against BOT_API_KEY.

import slugify from 'slugify';
import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import { getGame, isGameSlug, GAME_SLUGS } from '@/config/games';
import {
  discordIdSchema,
  slugSchema,
  isoDateSchema,
  boundedString,
  gameSlugSchema,
} from '@/utils/botValidation';
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

// POST body. GET (list) has no body so bodySchema only gates POST.
const createBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  name: boundedString(1, 255),
  slug: slugSchema.optional(),
  start_date: isoDateSchema.optional(),
  end_date: isoDateSchema.optional(),
  status: z.enum(VALID_STATUSES).optional(),
  max_teams: z.number().int().min(1).optional(),
  game: gameSlugSchema.optional(),
});

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
    .eq('tenant_id', req.botContext!.tenantId)
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
  const actor = await requireBotStaff(req, res, req.body ?? {});
  if (!actor) return;

  // Body validé par withBotRoute (bodySchema, non-safe methods only).
  const input = req.botInput as z.infer<typeof createBodySchema>;

  const name = input.name;

  const slug =
    input.slug && input.slug.length > 0
      ? input.slug
      : slugify(name, { lower: true, strict: true });

  // Slug uniqueness check (mirrors the admin endpoint behaviour).
  const { data: existing } = await supabaseAdmin!
    .from('tournaments')
    .select('id')
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('slug', slug)
    .maybeSingle();
  if (existing) {
    return res.status(409).json({
      error: `Un tournoi avec le slug "${slug}" existe déjà.`,
    });
  }

  const startDate = input.start_date ?? null;
  const endDate = input.end_date ?? null;
  if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
    return res
      .status(400)
      .json({ error: 'start_date must be before end_date' });
  }

  const rawStatus: Status = input.status ?? 'draft';
  const maxTeams: number | null = input.max_teams ?? null;

  // gameSlugSchema valide la *forme* du slug ; on garde le contrôle
  // d'appartenance à la liste réelle des jeux supportés (sémantique
  // historique : un slug bien formé mais inconnu est rejeté).
  let game: string | null = null;
  if (input.game != null) {
    if (!isGameSlug(input.game)) {
      return res.status(400).json({
        error: `Invalid game. Supported: ${GAME_SLUGS.join(', ')}`,
      });
    }
    game = input.game;
  }

  const payload = {
    tenant_id: req.botContext!.tenantId,
    name,
    slug,
    game,
    status: rawStatus,
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

  // Auto-populate the tournament map pool (parity with admin POST).
  const gameDef = data.game ? getGame(data.game) : null;
  if (gameDef?.hasMapVeto && gameDef.mapPool.length > 0) {
    try {
      const mapRows = gameDef.mapPool.map((m, idx) => ({
        tenant_id: req.botContext!.tenantId,
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
  }

  return res.status(201).json({ tournament: data });
}

export default withBotRoute(handler, {
  methods: ['GET', 'POST'],
  rateLimit: { max: 60, key: 'bot-tournaments' },
  idempotent: true,
  bodySchema: createBodySchema,
});
