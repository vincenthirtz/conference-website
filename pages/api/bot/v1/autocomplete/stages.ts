// GET /api/bot/v1/autocomplete/stages
//
// Autocomplete des phases d'un tournoi pour les commandes Discord qui
// demandent un stageId (/auto-byes, et plus tard /next-round, /finaliser).
//
// Filtre attendu : `tournamentId` (sinon liste vide — sans contexte de
// tournoi, l'autocomplete n'a aucune valeur ajoutee).
// Optionnel : `q` substring sur name/slug.
//
// Reponse : { results: [{ value: '<uuid>', label: '<...>' }] }

import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { escapePostgrestValue, isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const MAX_RESULTS = 25;
const DISCORD_LABEL_MAX = 100;

function trimLabel(s: string): string {
  return s.length > DISCORD_LABEL_MAX
    ? `${s.slice(0, DISCORD_LABEL_MAX - 1)}…`
    : s;
}

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const rawT = req.query.tournamentId;
  const tournamentId =
    typeof rawT === 'string' && rawT.trim() ? rawT.trim() : null;
  if (!tournamentId) {
    // Pas de filtre tournoi -> autocomplete vide. Le bot doit avoir resolu
    // un tournoi avant de proposer ses phases.
    return res.status(200).json({ results: [] });
  }
  if (!isValidUUID(tournamentId)) {
    return res.status(400).json({ error: 'tournamentId invalide' });
  }

  const rawQ = req.query.q;
  const q = typeof rawQ === 'string' ? rawQ.trim() : '';

  const rawLimit = Number(req.query.limit);
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_RESULTS)
      : MAX_RESULTS;

  let query = supabaseAdmin
    .from('tournament_stages')
    .select('id, name, slug, stage_type, order_index')
    .eq('tenant_id', req.botContext.tenantId)
    .eq('tournament_id', tournamentId)
    .order('order_index', { ascending: true })
    .limit(limit);

  if (q) {
    const safe = escapePostgrestValue(q);
    query = query.or(`name.ilike.%${safe}%,slug.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) {
    logger.error('[bot/autocomplete/stages] error', error);
    return res.status(200).json({ results: [] });
  }

  const results = (data ?? []).map((s) => {
    const row = s as {
      id: string;
      name?: string;
      stage_type?: string | null;
      order_index?: number | null;
    };
    const idx = typeof row.order_index === 'number' ? row.order_index : null;
    const prefix = idx != null ? `${idx + 1}. ` : '';
    const type = row.stage_type ? ` [${row.stage_type}]` : '';
    return {
      value: row.id,
      label: trimLabel(`${prefix}${row.name ?? '?'}${type}`),
    };
  });

  return res.status(200).json({ results });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 240, key: 'bot-ac-stages' },
});
