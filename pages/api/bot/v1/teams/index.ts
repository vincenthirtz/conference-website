// /api/bot/v1/teams
//
// GET   — Liste les equipes (filtres : search, isActive, isJoinable, country,
//         limit). Utile pour les autocompletions du bot (commande /scrim
//         create, /tournament register, etc.).
// POST  — Cree une equipe via le bot Discord.
//
// Auth: x-api-key (BOT_API_KEY).
//
// POST required: name, captainDiscordUserId (lie dans user_discord_links).
// POST optional: slug, shortName, logoUrl, description, country, discord, website.
//
// Le capitaine devient le captain_id et la 1ere ligne team_members. Si
// l'insertion du membre echoue, l'equipe est supprimee (rollback).

import slugify from 'slugify';
import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { sanitizeUrl } from '@/utils/apiHelpers';
import { boundedString, discordIdSchema } from '@/utils/botValidation';
import { logPlayerAction } from '@/utils/botPlayerLogs';
import { emitBotEvent } from '@/utils/botEvents';
import { logger } from '@/utils/logger';

const NAME_MIN = 2;
const NAME_MAX = 100;
const DESC_MAX = 2000;

// POST body. name 2-100, captainDiscordUserId requis. Le reste optionnel.
// NB volontaire : logoUrl / website ne sont PAS validés via httpUrlSchema ici
// — le handler historique les passe à sanitizeUrl() qui *null-ifie* une URL
// invalide au lieu de rejeter la requête. Un httpUrlSchema renverrait 400 et
// changerait le contrat. On garde donc des strings libres + sanitizeUrl dans
// le handler. Idem `slug` : transformé via slugify, jamais rejeté.
const createTeamBodySchema = z.object({
  name: boundedString(NAME_MIN, NAME_MAX),
  captainDiscordUserId: discordIdSchema,
  slug: z.string().optional(),
  shortName: z.string().optional(),
  logoUrl: z.string().optional(),
  // Borne sur la longueur APRÈS trim (comme le handler historique).
  description: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().max(DESC_MAX))
    .optional(),
  country: z.string().optional(),
  discord: z.string().optional(),
  website: z.string().optional(),
});

// GET filtres (tous optionnels, coercition côté handler conservée).
const listTeamsQuerySchema = z.object({
  limit: z.string().optional(),
  offset: z.string().optional(),
  search: z.string().optional(),
  country: z.string().optional(),
  isActive: z.string().optional(),
  isJoinable: z.string().optional(),
});

async function handleList(req: NextApiRequest, res: NextApiResponse) {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);

  const search =
    typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const country =
    typeof req.query.country === 'string' ? req.query.country.trim() : '';
  const isActive =
    req.query.isActive === undefined ? true : req.query.isActive === 'true';
  const isJoinable =
    req.query.isJoinable === '1' || req.query.isJoinable === 'true';

  let query = supabaseAdmin!
    .from('teams')
    .select(
      'id, name, slug, short_name, logo_url, country, is_active, is_joinable, discord_role_id, captain_id, created_at'
    )
    .eq('tenant_id', req.botContext!.tenantId)
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1);

  if (typeof isActive === 'boolean') {
    query = query.eq('is_active', isActive);
  }
  if (isJoinable) {
    query = query.eq('is_joinable', true);
  }
  if (country) {
    query = query.eq('country', country);
  }
  if (search) {
    const s = `%${search.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    query = query.or(`name.ilike.${s},slug.ilike.${s},short_name.ilike.${s}`);
  }

  const { data, error } = await query;
  if (error) {
    logger.error('[bot/teams] list error', error);
    return res.status(500).json({ error: 'Failed to list teams' });
  }
  return res.status(200).json({ teams: data ?? [] });
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') return handleList(req, res);

  // Body validé par withBotRoute (createTeamBodySchema). name/description déjà
  // trimmés ; les autres champs optionnels sont des strings brutes (trim ici).
  const body = req.botInput as z.infer<typeof createTeamBodySchema>;

  const name = body.name;
  const captainDiscordUserId = body.captainDiscordUserId;

  // Resolve the captain via user_discord_links.
  const { data: link, error: linkErr } = await supabaseAdmin
    .from('user_discord_links')
    .select('auth_user_id')
    .eq('discord_user_id', captainDiscordUserId)
    .maybeSingle();
  if (linkErr) {
    logger.error('[bot/teams] captain lookup error', linkErr);
    return res
      .status(500)
      .json({ error: 'Erreur de vérification du capitaine' });
  }
  if (!link) {
    return res.status(404).json({
      error:
        'Le capitaine doit avoir lié son compte Discord au site. Utilise /api/bot/register-user ou le dashboard joueur.',
    });
  }
  const captainAuthId = link.auth_user_id;

  const slug =
    typeof body.slug === 'string' && body.slug.trim().length > 0
      ? slugify(body.slug.trim(), { lower: true, strict: true })
      : slugify(name, { lower: true, strict: true });

  // Slug uniqueness
  const { data: existing } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('slug', slug)
    .maybeSingle();
  if (existing) {
    return res.status(409).json({
      error: `Une équipe avec le slug "${slug}" existe déjà.`,
    });
  }

  // description : déjà trimmée + bornée par le schéma (DESC_MAX).
  const description = body.description ?? '';

  const teamPayload: Record<string, unknown> = {
    tenant_id: req.botContext!.tenantId,
    name,
    slug,
    captain_id: captainAuthId,
    short_name:
      typeof body.shortName === 'string' ? body.shortName.trim() || null : null,
    logo_url:
      typeof body.logoUrl === 'string'
        ? sanitizeUrl(body.logoUrl) || null
        : null,
    description: description || null,
    country:
      typeof body.country === 'string' ? body.country.trim() || null : null,
    discord:
      typeof body.discord === 'string' ? body.discord.trim() || null : null,
    website:
      typeof body.website === 'string'
        ? sanitizeUrl(body.website) || null
        : null,
  };

  const { data: created, error: createErr } = await supabaseAdmin
    .from('teams')
    .insert(teamPayload)
    .select('*')
    .maybeSingle();

  if (createErr || !created) {
    logger.error('[bot/teams] create error', createErr);
    return res.status(500).json({ error: 'Échec de création de l’équipe' });
  }

  // Add the captain as a team_member. Roll back the team on failure so a
  // retry can use the same slug.
  const { error: memberErr } = await supabaseAdmin.from('team_members').insert({
    tenant_id: req.botContext!.tenantId,
    team_id: created.id,
    user_id: captainAuthId,
    role: 'captain',
  });
  if (memberErr) {
    logger.error('[bot/teams] member insert error, rolling back', memberErr);
    await supabaseAdmin
      .from('teams')
      .delete()
      .eq('tenant_id', req.botContext!.tenantId)
      .eq('id', created.id);
    return res
      .status(500)
      .json({ error: 'Échec de création (rollback effectué)' });
  }

  // Trace player-driven mutation. Logger.info for ops, bot_player_actions
  // for support audit trail. logPlayerAction is fire-and-forget.
  logger.info('[bot/teams] team created via bot', {
    teamId: created.id,
    slug: created.slug,
    captainAuthId,
    captainDiscordUserId,
  });
  void logPlayerAction({
    actorAuthUserId: captainAuthId,
    actorDiscordUserId: captainDiscordUserId,
    action: 'create_team',
    entityType: 'team',
    entityId: created.id,
    payload: { name: created.name, slug: created.slug },
  });

  // team.created -> chantier voice par equipe : le bot cree le salon vocal.
  void emitBotEvent(
    'team.created',
    {
      teamId: created.id,
      name: created.name,
      slug: created.slug ?? null,
      captainAuthUserId: captainAuthId,
      captainDiscordUserId,
      discordRoleId: created.discord_role_id ?? null,
    },
    req.botContext!.tenantId
  ).catch((e) => logger.error('[botEvents] team.created emit error:', e));

  return res.status(201).json({ team: created });
}

export default withBotRoute(handler, {
  methods: ['GET', 'POST'],
  rateLimit: { max: 60, key: 'bot-teams' },
  idempotent: true,
  bodySchema: createTeamBodySchema,
  querySchema: listTeamsQuerySchema,
});
