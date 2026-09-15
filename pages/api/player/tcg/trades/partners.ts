// pages/api/player/tcg/trades/partners.ts
//
//   GET → les collectionneuses de MON espace qui acceptent des propositions.
//
// CE N'EST PAS UN ANNUAIRE. Le dépôt s'interdit toute liste de joueuses
// (`docs/TCG.md` §1, `create_player_discovery_profiles.sql`) ; cette liste n'en
// est pas une parce qu'elle ne contient QUE des personnes qui ont activé les
// échanges — geste explicite, dont la page dit qu'il les rend visibles des
// autres collectionneuses volontaires — et qu'elle n'est servie qu'à une
// appelante qui l'a fait elle-même (réciprocité : on ne regarde pas sans être
// vue).
//
// BORNÉE AU TENANT, SANS EMAIL. On lit `tcg_trade_settings` de l'espace, puis on
// NOMME ces comptes (`readCollectorNames`) : aucune recherche plateforme, aucune
// RPC de recherche staff (`admin_search_users` n'est pas filtrée par tenant), et
// l'email que la RPC de profils rend est jeté. Un compte que personne ne sait
// nommer est écarté : on ne le désignerait qu'avec une donnée privée.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { logger } from '@/utils/logger';
import { readCollectorNames, readTradeSettings } from '@/utils/tcg/trades';

/** Borne de lecture : un espace n'a pas des milliers de volontaires. */
const MAX_PARTNERS = 500;

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'player-tcg-trade-partners'
    )
  ) {
    return;
  }

  const tenantId = resolveTenantIdForUserRequest(req);
  res.setHeader('Cache-Control', 'private, no-store');

  const mine = await readTradeSettings(tenantId, user.id);
  if (!mine.ok) return res.status(500).json({ error: 'Lecture impossible.' });
  if (!mine.acceptsProposals) {
    return res.status(403).json({
      error: 'Active les échanges pour voir les partenaires.',
      code: 'trading_disabled',
    });
  }

  const { data, error } = await supabaseAdmin
    .from('tcg_trade_settings')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('accepts_proposals', true)
    .neq('user_id', user.id)
    .limit(MAX_PARTNERS);
  if (error) {
    logger.error('[tcg/trades] partenaires illisibles: %s', error.message);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  const ids = ((data ?? []) as Array<{ user_id: string }>).map(
    (r) => r.user_id
  );
  const names = await readCollectorNames(tenantId, ids);

  const partners = ids
    .map((id) => ({ userId: id, displayName: names.get(id) ?? null }))
    .filter(
      (p): p is { userId: string; displayName: string } =>
        typeof p.displayName === 'string' && p.displayName.length > 0
    )
    .sort((a, b) =>
      a.displayName.localeCompare(b.displayName, 'fr', { sensitivity: 'base' })
    );

  return res.status(200).json({ partners });
});
