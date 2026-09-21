// pages/api/teams/index.ts
// API publique pour lister les équipes actives
// - GET : liste des équipes avec recherche optionnelle
// - GET ?ids=a,b,c : lecture GROUPÉE par identifiants (cf. `parseIdsParam`)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  isValidUUID,
  parsePagination,
  sanitizeSearch,
  escapePostgrestValue,
} from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';
import { resolveTenantIdForPublicRequestAsync } from '@/utils/tenant';
import { MAX_TEAM_PLAYERS } from '@/utils/constants';
import { countPlayingMembers } from '@/utils/teams/roleKind';

import { logger } from '../../../utils/logger';
export type PublicTeam = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  country: string | null;
  member_count: number;
  is_joinable: boolean;
  /**
   * L'équipe se déclare disponible pour un scrim. Exposé (R3) pour que la
   * sélection d'adversaire soit informée : sans ce signal, choisir un
   * adversaire revient à tirer au sort dans une liste alphabétique.
   */
  open_for_scrim: boolean;
};

/**
 * Nombre maximal d'identifiants par lecture groupée. Borne l'URL (50 UUID ≈
 * 1,85 Ko, loin des limites des CDN) et la requête `in (...)`. Rester sous la
 * pagination par défaut (100) garantit qu'un lot n'est jamais tronqué.
 */
export const MAX_TEAM_IDS = 50;

/**
 * `?ids=` : lecture groupée des équipes par identifiant.
 *
 * POURQUOI : `hooks/useTeamNames` faisait un `GET /api/teams/:id` PAR équipe
 * (deux par grille de disponibilités sur le tableau de bord). Une requête pour
 * N noms à la place.
 *
 * Tout-ou-rien : un seul identifiant invalide refuse le lot (400). Filtrer en
 * silence rendrait une réponse partielle indiscernable d'équipes inexistantes.
 * Dédupliqué ; l'ORDRE est laissé au client (il trie pour partager le cache
 * CDN, qui varie sur toute la query — `next.config.js`).
 *
 * Renvoie `null` si le paramètre est absent, `{ error }` s'il est invalide.
 */
export function parseIdsParam(
  raw: string | string[] | undefined
): string[] | null | { error: string } {
  if (raw === undefined) return null;
  // `?ids=a&ids=b` est accepté comme `?ids=a,b` : même intention.
  const parts = (Array.isArray(raw) ? raw : [raw])
    .flatMap((chunk) => chunk.split(','))
    .map((id) => id.trim())
    .filter(Boolean);
  const unique = Array.from(new Set(parts.map((id) => id.toLowerCase())));
  if (unique.length === 0) return { error: 'ids must not be empty' };
  if (unique.length > MAX_TEAM_IDS) {
    return { error: `ids accepts at most ${MAX_TEAM_IDS} values` };
  }
  if (!unique.every(isValidUUID)) return { error: 'ids must be UUIDs' };
  return unique;
}

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
    // Validation AVANT toute lecture : un lot invalide ne coûte rien en base.
    const ids = parseIdsParam(req.query.ids);
    if (ids && !Array.isArray(ids)) {
      return res.status(400).json({ error: ids.error });
    }

    const tenantId = await resolveTenantIdForPublicRequestAsync(req);

    const { limit: limitNum, offset: offsetNum } = parsePagination(req, {
      limit: 100,
    });
    const search = sanitizeSearch(req.query.search);

    const joinable = req.query.joinable;
    const onlyJoinable = joinable === '1' || joinable === 'true';
    const scrimQuery = req.query.open_for_scrim;
    const onlyOpenForScrim = scrimQuery === '1' || scrimQuery === 'true';
    const country =
      typeof req.query.country === 'string' ? req.query.country.trim() : '';

    let query = supabaseAdmin
      .from('teams')
      // On embarque les RÔLES plutôt qu'un `team_members(count)` : l'effectif
      // qui compte pour « équipe pleine » exclut l'encadrement (coach /
      // manager), et un agrégat PostgREST ne sait pas exprimer ça sans
      // ambiguïté sur le filtrage de la ressource embarquée.
      .select(
        'id, name, short_name, logo_url, country, is_joinable, open_for_scrim, team_members(role)',
        {
          count: 'exact',
        }
      )
      .eq('tenant_id', tenantId);

    // Scope espace conservé (ci-dessus) : un identifiant d'un autre espace ne
    // renvoie rien, exactement comme `/api/teams/:id` répond 404.
    if (ids) {
      query = query.in('id', ids);
    }

    // Filter by joinable status
    if (onlyJoinable) {
      query = query.eq('is_joinable', true);
    }

    // Ne garder que les équipes qui cherchent un scrim.
    if (onlyOpenForScrim) {
      query = query.eq('open_for_scrim', true);
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

    // Aplatir le count des membres. La forme recopie le `.select()` ci-dessus :
    // `team_members` est un embed PostgREST, donc un tableau (éventuellement
    // vide), et c'est exactement ce que `countPlayingMembers` tolère.
    type TeamListRow = {
      id: string;
      name: string;
      short_name: string | null;
      logo_url: string | null;
      country: string | null;
      is_joinable: boolean | null;
      open_for_scrim: boolean | null;
      team_members: { role: string | null }[] | null;
    };
    let teams: PublicTeam[] = ((data || []) as TeamListRow[]).map((t) => ({
      id: t.id,
      name: t.name,
      short_name: t.short_name,
      logo_url: t.logo_url,
      country: t.country,
      member_count: countPlayingMembers(t.team_members),
      is_joinable: t.is_joinable ?? false,
      open_for_scrim: t.open_for_scrim ?? false,
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
