// pages/api/teams/index.ts
// API publique pour lister les équipes actives
// - GET : liste des équipes avec recherche optionnelle

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  parsePagination,
  sanitizeSearch,
  escapePostgrestValue,
} from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';
import { resolveTenantIdForPublicRequest } from '@/utils/tenant';
import { MAX_TEAM_PLAYERS } from '@/utils/constants';

import { logger } from '../../../utils/logger';
export type PublicTeam = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  country: string | null;
  member_count: number;
  is_joinable: boolean;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'teams')) return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    const tenantId = resolveTenantIdForPublicRequest(req);

    const { limit: limitNum, offset: offsetNum } = parsePagination(req, {
      limit: 100,
    });
    const search = sanitizeSearch(req.query.search);

    const joinable = req.query.joinable;
    const onlyJoinable = joinable === '1' || joinable === 'true';
    const country =
      typeof req.query.country === 'string' ? req.query.country.trim() : '';

    let query = supabaseAdmin
      .from('teams')
      .select(
        'id, name, short_name, logo_url, country, is_joinable, team_members(count)',
        {
          count: 'exact',
        }
      )
      .eq('tenant_id', tenantId);

    // Filter by joinable status
    if (onlyJoinable) {
      query = query.eq('is_joinable', true);
    }

    // Filter by country
    if (country) {
      query = query.eq('country', country);
    }

    // Recherche par nom
    if (search) {
      const s = `%${escapePostgrestValue(search)}%`;
      query = query.or(`name.ilike.${s},short_name.ilike.${s}`);
    }

    query = query
      .order('name', { ascending: true })
      .range(offsetNum, offsetNum + limitNum - 1);

    const { data, error, count } = await query;

    if (error) {
      logger.error('[api/teams] error:', error);
      return res.status(500).json({ error: 'Failed to fetch teams' });
    }

    // Aplatir le count des membres
    let teams: PublicTeam[] = (data || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      short_name: t.short_name,
      logo_url: t.logo_url,
      country: t.country,
      member_count: t.team_members?.[0]?.count ?? 0,
      is_joinable: t.is_joinable ?? false,
    }));

    // Exclusion des équipes PLEINES en mode « rejoindre » (joinable=1).
    // Le filtre par agrégat (`team_members(count)`) n'est pas exprimable côté
    // PostgREST, donc on l'applique après coup sur le tableau aplati : une
    // équipe joinable qui a atteint MAX_TEAM_PLAYERS membres ne doit jamais
    // apparaître dans la liste de recrutement.
    //
    // NOTE sur `total` : il reflète le count DB (équipes joinable du tenant)
    // AVANT exclusion des pleines. C'est volontaire — `total` reste un
    // indicateur de cardinalité côté DB, pas la longueur exacte de `teams`.
    if (onlyJoinable) {
      teams = teams.filter((t) => t.member_count < MAX_TEAM_PLAYERS);
    }

    res.setHeader(
      'Cache-Control',
      'public, s-maxage=300, stale-while-revalidate=120'
    );
    return res.status(200).json({
      teams,
      total: typeof count === 'number' ? count : null,
    });
  } catch (err: unknown) {
    logger.error('[api/teams] internal error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
