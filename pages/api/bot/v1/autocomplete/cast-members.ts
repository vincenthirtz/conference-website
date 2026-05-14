// GET /api/bot/v1/autocomplete/cast-members
//
// Autocomplete des cast_members pour /assigner-cast et /retirer-cast.
// Recherche substring sur le nom (cast_members.name) et liste seulement les
// casters actifs (is_active != false).
//
// Reponse : { results: [{ value: '<uuid>', label: '<name>' }] }

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { escapePostgrestValue } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const MAX_RESULTS = 25;
const DISCORD_LABEL_MAX = 100;

function trimLabel(s: string): string {
  return s.length > DISCORD_LABEL_MAX
    ? `${s.slice(0, DISCORD_LABEL_MAX - 1)}…`
    : s;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const rawQ = req.query.q;
  const q = typeof rawQ === 'string' ? rawQ.trim() : '';

  const rawLimit = Number(req.query.limit);
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_RESULTS)
      : MAX_RESULTS;

  // La table cast_members peut ne pas avoir de colonne is_active selon le
  // schema (on a vu name, auth_user_id, image_url dans les selects existants).
  // Donc on ne filtre pas — c'est au bot de cacher les inactifs au besoin.
  let query = supabaseAdmin
    .from('cast_members')
    .select('id, name')
    .order('name', { ascending: true })
    .limit(limit);

  if (q) {
    const safe = escapePostgrestValue(q);
    query = query.ilike('name', `%${safe}%`);
  }

  const { data, error } = await query;
  if (error) {
    logger.error('[bot/autocomplete/cast-members] error', error);
    return res.status(200).json({ results: [] });
  }

  const results = (data ?? []).map((c) => {
    const row = c as { id: string; name?: string | null };
    return {
      value: row.id,
      label: trimLabel(row.name ?? '?'),
    };
  });

  return res.status(200).json({ results });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 240, key: 'bot-ac-cast-members' },
});
