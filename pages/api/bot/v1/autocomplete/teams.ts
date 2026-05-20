// GET /api/bot/v1/autocomplete/teams
//
// Autocomplete teams : recherche substring sur name/slug/short_name.
// Optionnellement filtre les teams inscrites a un tournoi (utile pour
// /forfait, /reset-match, etc. ou la team doit etre dans le match).
//
// Reponse : { results: [{ value: '<uuid>', label: '<name>' }] }

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { escapePostgrestValue, isValidUUID } from '@/utils/apiHelpers';
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

  const rawTournamentId = req.query.tournamentId;
  const tournamentId =
    typeof rawTournamentId === 'string' && rawTournamentId.trim()
      ? rawTournamentId.trim()
      : null;
  if (tournamentId && !isValidUUID(tournamentId)) {
    return res.status(400).json({ error: 'tournamentId invalide' });
  }

  // Cas filtre par tournoi : on resout d'abord les team_ids inscrites, puis on
  // filtre teams par cette liste. Deux requetes mais batch — toujours <30ms.
  let allowedTeamIds: string[] | null = null;
  if (tournamentId) {
    const { data: rows, error: stErr } = await supabaseAdmin
      .from('stage_teams')
      .select('team_id, tournament_stages!inner(tournament_id)')
      .eq('tenant_id', req.botContext!.tenantId)
      .eq('tournament_stages.tournament_id', tournamentId);
    if (stErr) {
      logger.error('[bot/autocomplete/teams] stage_teams error', stErr);
      return res.status(200).json({ results: [] });
    }
    allowedTeamIds = [
      ...new Set((rows ?? []).map((r) => (r as { team_id: string }).team_id)),
    ];
    if (allowedTeamIds.length === 0) {
      return res.status(200).json({ results: [] });
    }
  }

  let query = supabaseAdmin
    .from('teams')
    .select('id, name, short_name, slug, country')
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('is_active', true)
    .order('name', { ascending: true })
    .limit(limit);

  if (allowedTeamIds) query = query.in('id', allowedTeamIds);
  if (q) {
    const safe = escapePostgrestValue(q);
    query = query.or(
      `name.ilike.%${safe}%,slug.ilike.%${safe}%,short_name.ilike.%${safe}%`
    );
  }

  const { data, error } = await query;
  if (error) {
    logger.error('[bot/autocomplete/teams] error', error);
    return res.status(200).json({ results: [] });
  }

  const results = (data ?? []).map((t) => ({
    value: t.id,
    label: trimLabel(
      `${t.name ?? '?'}${t.short_name ? ` [${t.short_name}]` : ''}${
        t.country ? ` · ${t.country}` : ''
      }`
    ),
  }));

  return res.status(200).json({ results });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 240, key: 'bot-ac-teams' },
});
