// GET /api/bot/teams/[teamId]
//
// Resoud une equipe par UUID ou slug. Renvoie l'equipe + ses membres
// (utile pour le bot Discord : commandes /scrim, /team show, autocomplete).
//
// Auth: x-api-key valide contre BOT_API_KEY.

import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '../../../../utils/logger';

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
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'bot-team-id'))
    return;

  if (!process.env.BOT_API_KEY) {
    logger.error('[bot/team] BOT_API_KEY is unset');
    return res.status(500).json({ error: 'Endpoint not configured.' });
  }
  if (!verifyBotApiKey(req)) {
    return res.status(401).json({ error: 'Invalid or missing API key.' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database unavailable.' });
  }

  const raw = req.query.teamId;
  const idOrSlug = Array.isArray(raw) ? raw[0] : raw;
  if (!idOrSlug) {
    return res.status(400).json({ error: 'teamId requis' });
  }

  const includeMembers =
    req.query.includeMembers === '1' || req.query.includeMembers === 'true';

  let q = supabaseAdmin
    .from('teams')
    .select(
      'id, name, slug, short_name, logo_url, banner_url, country, description, discord, discord_role_id, website, is_active, is_joinable, captain_id, created_at, updated_at'
    );
  q = isValidUUID(idOrSlug) ? q.eq('id', idOrSlug) : q.eq('slug', idOrSlug);

  const { data: team, error } = await q.maybeSingle();
  if (error) {
    logger.error('[bot/team] fetch error', error);
    return res.status(500).json({ error: 'Failed to load team' });
  }
  if (!team) return res.status(404).json({ error: 'Equipe introuvable' });

  let members: unknown[] = [];
  if (includeMembers) {
    const { data: m, error: mErr } = await supabaseAdmin
      .from('team_members')
      .select('id, user_id, role, battle_tag, is_substitute, created_at')
      .eq('team_id', team.id)
      .order('created_at', { ascending: true });
    if (mErr) {
      logger.error('[bot/team] members fetch error', mErr);
    } else {
      members = m ?? [];
    }
  }

  return res.status(200).json({ team, members });
}
