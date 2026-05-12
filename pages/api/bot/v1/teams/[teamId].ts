// GET /api/bot/v1/teams/[teamId]
//
// Resoud une equipe par UUID ou slug. Renvoie l'equipe + ses membres
// (utile pour le bot Discord : commandes /scrim, /team show, autocomplete).
//
// Auth: x-api-key valide contre BOT_API_KEY.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

async function handler(req: NextApiRequest, res: NextApiResponse) {
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

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 60, key: 'bot-team-id' },
});
