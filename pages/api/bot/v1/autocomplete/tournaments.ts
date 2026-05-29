// GET /api/bot/v1/autocomplete/tournaments
//
// Discord slash-command autocomplete : renvoie une liste tronquee (max 25)
// de tournois matchant le terme `q` partiel, formatee pour Discord :
//   { results: [{ value: '<uuid>', label: '<name (status)>' }] }
//
// Le bot appelle cet endpoint a chaque keystroke. Pas d'acteur requis : les
// noms de tournois sont publics. Filtres optionnels :
//   - q       : substring (ilike) sur name + slug
//   - status  : filtre exact ('draft' | 'published' | 'running' | etc.)
//   - limit   : 1..25, defaut 25

import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { escapePostgrestValue } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const MAX_RESULTS = 25;
const DISCORD_LABEL_MAX = 100;

function trimLabel(s: string): string {
  return s.length > DISCORD_LABEL_MAX
    ? `${s.slice(0, DISCORD_LABEL_MAX - 1)}…`
    : s;
}

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const rawQ = req.query.q;
  const q = typeof rawQ === 'string' ? rawQ.trim() : '';

  const rawLimit = Number(req.query.limit);
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_RESULTS)
      : MAX_RESULTS;

  const rawStatus = req.query.status;
  const status =
    typeof rawStatus === 'string' && rawStatus.trim() ? rawStatus.trim() : null;

  let query = supabaseAdmin
    .from('tournaments')
    .select('id, name, slug, status')
    .eq('tenant_id', req.botContext.tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) query = query.eq('status', status);
  if (q) {
    const safe = escapePostgrestValue(q);
    query = query.or(`name.ilike.%${safe}%,slug.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) {
    logger.error('[bot/autocomplete/tournaments] error', error);
    // Autocomplete: jamais d'erreur 5xx, Discord affichera juste une liste vide.
    return res.status(200).json({ results: [] });
  }

  const results = (data ?? []).map((t) => ({
    value: t.id,
    label: trimLabel(`${t.name ?? '?'}${t.status ? ` (${t.status})` : ''}`),
  }));

  return res.status(200).json({ results });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  // Autocomplete fires per keystroke : limite haute pour eviter de bloquer
  // les utilisateurs qui tapent vite. Le payload est leger (25 lignes max).
  rateLimit: { max: 240, key: 'bot-ac-tournaments' },
});
