// POST /api/bot/teams
//
// Creates a team via the Discord bot.
//
// Auth: x-api-key (BOT_API_KEY).
// Required: name, captainDiscordUserId (must already be in user_discord_links).
// Optional: slug, shortName, logoUrl, description, country, discord, website.
//
// The captain becomes both the team's captain (teams.captain_id) and the
// first team_members row. Rolls back the team if the member insert fails.

import crypto from 'crypto';
import slugify from 'slugify';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { sanitizeUrl } from '@/utils/apiHelpers';
import { logger } from '../../../../utils/logger';

const DISCORD_ID_RE = /^[0-9]{15,25}$/;
const NAME_MIN = 2;
const NAME_MAX = 100;
const DESC_MAX = 2000;

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'bot-teams'))
    return;

  if (!process.env.BOT_API_KEY) {
    logger.error('[bot/teams] BOT_API_KEY is unset');
    return res.status(500).json({ error: 'Endpoint not configured.' });
  }
  if (!verifyBotApiKey(req)) {
    return res.status(401).json({ error: 'Invalid or missing API key.' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database unavailable.' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return res
      .status(400)
      .json({ error: `Le nom doit faire entre ${NAME_MIN} et ${NAME_MAX} caractères.` });
  }

  const captainDiscordUserId =
    typeof body.captainDiscordUserId === 'string'
      ? body.captainDiscordUserId.trim()
      : '';
  if (!DISCORD_ID_RE.test(captainDiscordUserId)) {
    return res.status(400).json({ error: 'captainDiscordUserId requis' });
  }

  // Resolve the captain via user_discord_links.
  const { data: link, error: linkErr } = await supabaseAdmin
    .from('user_discord_links')
    .select('auth_user_id')
    .eq('discord_user_id', captainDiscordUserId)
    .maybeSingle();
  if (linkErr) {
    logger.error('[bot/teams] captain lookup error', linkErr);
    return res.status(500).json({ error: 'Erreur de vérification du capitaine' });
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
    .eq('slug', slug)
    .maybeSingle();
  if (existing) {
    return res.status(409).json({
      error: `Une équipe avec le slug "${slug}" existe déjà.`,
    });
  }

  const description =
    typeof body.description === 'string' ? body.description.trim() : '';
  if (description.length > DESC_MAX) {
    return res
      .status(400)
      .json({ error: `Description trop longue (max ${DESC_MAX}).` });
  }

  const teamPayload: Record<string, unknown> = {
    name,
    slug,
    captain_id: captainAuthId,
    short_name:
      typeof body.shortName === 'string' ? body.shortName.trim() || null : null,
    logo_url:
      typeof body.logoUrl === 'string' ? sanitizeUrl(body.logoUrl) || null : null,
    description: description || null,
    country: typeof body.country === 'string' ? body.country.trim() || null : null,
    discord: typeof body.discord === 'string' ? body.discord.trim() || null : null,
    website:
      typeof body.website === 'string' ? sanitizeUrl(body.website) || null : null,
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
    team_id: created.id,
    user_id: captainAuthId,
    role: 'captain',
  });
  if (memberErr) {
    logger.error('[bot/teams] member insert error, rolling back', memberErr);
    await supabaseAdmin.from('teams').delete().eq('id', created.id);
    return res
      .status(500)
      .json({ error: 'Échec de création (rollback effectué)' });
  }

  return res.status(201).json({ team: created });
}
