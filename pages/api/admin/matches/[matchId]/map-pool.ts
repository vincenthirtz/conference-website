// pages/api/admin/matches/[matchId]/map-pool.ts
//
// Pool de cartes applicable à un match, pour l'écran d'arbitrage.
//
// POURQUOI : le nom de carte d'une partie était saisi en TEXTE LIBRE. En
// production, les parties enregistrées portent « Map 1 », « Map 2 »… alors que
// le pool en compte trente — toute statistique par carte (vue team_map_stats,
// /tournament/[id]/maps) est donc vide de sens. Cet endpoint alimente la liste
// de suggestions du champ, pendant que l'écriture (games.ts) normalise ce qui
// arrive vraiment.
//
// Même permission que l'édition des parties (`arbitrate_matches`) : qui peut
// saisir un score peut lire le pool.
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import { resolveEffectiveMapPool, toOne } from '@/utils/maps/pool';
import { logger } from '../../../../../utils/logger';

export default withStaffRoute(handler, { permission: 'arbitrate_matches' });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const raw = req.query.matchId;
  const matchId = Array.isArray(raw) ? raw[0] : raw;
  if (!matchId || !isValidUUID(matchId)) {
    return res.status(400).json({ error: 'matchId invalide' });
  }

  try {
    // Un match appartient soit à un tournoi, soit à un scrim : le jeu vient de
    // l'un ou de l'autre.
    const { data, error } = await supabaseAdmin
      .from('matches')
      .select('tournament_id, tournament:tournaments(game), scrim:scrims(game)')
      .eq('id', matchId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (error) {
      logger.error('[admin/matches/:id/map-pool] lookup error:', error);
      return res.status(500).json({ error: 'Failed to load match' });
    }
    if (!data) return res.status(404).json({ error: 'Match not found' });

    const row = data as {
      tournament_id: string | null;
      tournament: { game: string | null } | { game: string | null }[] | null;
      scrim: { game: string | null } | { game: string | null }[] | null;
    };

    const { maps, source } = await resolveEffectiveMapPool(supabaseAdmin, {
      tenantId: ctx.tenantId,
      tournamentId: row.tournament_id,
      game: toOne(row.tournament)?.game ?? toOne(row.scrim)?.game ?? null,
    });

    return res.status(200).json({ maps, source });
  } catch (err) {
    logger.error('[admin/matches/:id/map-pool] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
