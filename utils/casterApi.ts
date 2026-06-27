// utils/casterApi.ts
//
// Shared request handlers for the caster-app HTTP contract consumed by the
// womenscup-caster Electron app. The canonical routes live under
// `/api/caster/v1/*` and the legacy routes (`/api/caster/tournaments*`,
// `/api/caster/matches/[id]`) are thin deprecated aliases that call these
// same functions plus stamp Deprecation/Sunset/Link headers.
//
// Keeping the body here means v1 and legacy can never drift: both import the
// exact same query + shaping logic. See docs/CASTER_API_CONTRACT.md.
//
// ─────────────────────────────────────────────────────────────────────────────
// SÉCURITÉ — posture "public GET, scoped by tenant" (VOLONTAIRE, contractuel).
//
// Ces handlers n'ont PAS de gate d'auth (pas de withCasterRoute / token) ET
// résolvent le tenant depuis le header client `x-tenant-id` (resolveTenantId).
// Ce n'est PAS un leak : c'est documenté et autoritaire dans
// docs/CASTER_API_CONTRACT.md (tableau "public GET"), et les champs renvoyés
// sont DÉJÀ publics sur le site :
//   - les matchs (status pending/ongoing/finished, scheduled_at, round_name,
//     scores, noms d'équipes) sont déjà servis à tout visiteur par la page
//     publique pages/tournament/[id].tsx (select sur `matches`, filtre
//     `neq('status','cancelled')`, même tenant scoping) ;
//   - `stream_url` est une URL Twitch publique par nature ;
//   - on n'expose PAS `lobby_code` ni aucun champ interne (le dashboard riche
//     caster, lui, passe par /api/cast/[matchId] qui EST gated
//     `withStaffRoute('caster')`).
//
// Le `x-tenant-id` ne sert qu'à choisir un sous-ensemble de données déjà
// publiques d'un autre tenant : aucune élévation de privilège possible. Si un
// jour ces routes devaient exposer des données non-publiées / internes, il
// FAUDRAIT alors ajouter un gate `withCasterRoute` (cf. utils/casterAuth.ts)
// + valider le tenant résolu contre le caster authentifié — ce n'est pas le
// cas aujourd'hui.
// ─────────────────────────────────────────────────────────────────────────────

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from './supabase';
import { resolveTenantId } from './tenant';
import { applyRateLimit } from './rateLimit';
import { isValidUUID } from './apiHelpers';
import { logger } from './logger';

/**
 * Sunset date for the legacy `/api/caster/*` aliases (~6 months out from the
 * v1 cut). After this date the legacy routes may be removed; the caster app
 * MUST migrate to `/api/caster/v1/*` before then. Exposed via the HTTP
 * `Sunset` header (RFC 8594) on every legacy response.
 */
export const CASTER_LEGACY_SUNSET = 'Wed, 23 Dec 2026 00:00:00 GMT';

/**
 * Stamp the standard deprecation headers on a legacy alias response.
 *
 * - `Deprecation: true` (RFC 8594 draft) — the route is deprecated.
 * - `Sunset: <http-date>` (RFC 8594) — when it may stop working.
 * - `Link: <v1-path>; rel="successor-version"` — where to migrate.
 *
 * Runtime behaviour is otherwise untouched: the caster keeps getting the
 * same body/status from the shared handler.
 */
export function markCasterLegacyDeprecated(
  res: NextApiResponse,
  successorPath: string
): void {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', CASTER_LEGACY_SUNSET);
  res.setHeader('Link', `<${successorPath}>; rel="successor-version"`);
}

function rl(
  req: NextApiRequest,
  res: NextApiResponse,
  storeName: string
): boolean {
  return applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, storeName);
}

function firstQueryValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/* ------------------------------------------------------------------ *
 * GET /api/caster/(v1/)tournaments
 * ------------------------------------------------------------------ */

export async function handleCasterTournamentsList(
  req: NextApiRequest,
  res: NextApiResponse,
  rateKey: string
): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (rl(req, res, rateKey)) return;

  if (!supabaseAdmin) {
    res.status(500).json({ error: 'Service unavailable' });
    return;
  }

  const tenantId = resolveTenantId(req);

  const { data, error } = await supabaseAdmin
    .from('tournaments')
    .select('id, name, slug, game, status, start_date, format_type')
    .eq('tenant_id', tenantId)
    .in('status', ['running', 'published'])
    .order('start_date', { ascending: false, nullsFirst: false });

  if (error) {
    logger.error('[caster/tournaments] list error:', error);
    res.status(500).json({ error: 'Failed to load tournaments' });
    return;
  }

  res.status(200).json({ tournaments: data ?? [] });
}

/* ------------------------------------------------------------------ *
 * GET /api/caster/(v1/)tournaments/:id/matches
 * ------------------------------------------------------------------ */

export async function handleCasterTournamentMatches(
  req: NextApiRequest,
  res: NextApiResponse,
  rateKey: string
): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (rl(req, res, rateKey)) return;

  if (!supabaseAdmin) {
    res.status(500).json({ error: 'Service unavailable' });
    return;
  }

  const id = firstQueryValue(req.query.id);
  if (!id || !isValidUUID(id)) {
    res.status(400).json({ error: 'Invalid tournament id' });
    return;
  }

  const tenantId = resolveTenantId(req);

  const { data, error } = await supabaseAdmin
    .from('matches')
    .select(
      `
      id, status, best_of, match_format, scheduled_at,
      team1_score, team2_score, round_name, stream_url,
      team1:teams!matches_team1_id_fkey(id, name, short_name, logo_url),
      team2:teams!matches_team2_id_fkey(id, name, short_name, logo_url)
    `
    )
    .eq('tournament_id', id)
    .eq('tenant_id', tenantId)
    .in('status', ['pending', 'ongoing', 'finished'])
    .order('scheduled_at', { ascending: true, nullsFirst: false });

  if (error) {
    logger.error('[caster/tournaments/:id/matches] error:', error);
    res.status(500).json({ error: 'Failed to load matches' });
    return;
  }

  res.status(200).json({ matches: data ?? [] });
}

/* ------------------------------------------------------------------ *
 * GET /api/caster/(v1/)tournaments/:id/maps
 * ------------------------------------------------------------------ */

export async function handleCasterTournamentMaps(
  req: NextApiRequest,
  res: NextApiResponse,
  rateKey: string
): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (rl(req, res, rateKey)) return;

  if (!supabaseAdmin) {
    res.status(500).json({ error: 'Service unavailable' });
    return;
  }

  const id = firstQueryValue(req.query.id);
  if (!id || !isValidUUID(id)) {
    res.status(400).json({ error: 'Invalid tournament id' });
    return;
  }

  const tenantId = resolveTenantId(req);

  const { data, error } = await supabaseAdmin
    .from('tournament_maps')
    .select('id, map_name, map_type, image_url')
    .eq('tournament_id', id)
    .eq('tenant_id', tenantId)
    .eq('enabled', true)
    .order('map_name', { ascending: true });

  if (error) {
    logger.error('[caster/tournaments/:id/maps] error:', error);
    res.status(500).json({ error: 'Failed to load maps' });
    return;
  }

  res.status(200).json({ maps: data ?? [] });
}

/* ------------------------------------------------------------------ *
 * GET /api/caster/(v1/)matches/:id
 * ------------------------------------------------------------------ */

export async function handleCasterMatchDetail(
  req: NextApiRequest,
  res: NextApiResponse,
  rateKey: string
): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (rl(req, res, rateKey)) return;

  if (!supabaseAdmin) {
    res.status(500).json({ error: 'Service unavailable' });
    return;
  }

  const id = firstQueryValue(req.query.id);
  if (!id || !isValidUUID(id)) {
    res.status(400).json({ error: 'Invalid match id' });
    return;
  }

  const tenantId = resolveTenantId(req);

  const { data: match, error: matchErr } = await supabaseAdmin
    .from('matches')
    .select(
      `
      id, status, best_of, match_format, scheduled_at,
      team1_score, team2_score, round_name, stream_url,
      team1:teams!matches_team1_id_fkey(id, name, short_name, logo_url),
      team2:teams!matches_team2_id_fkey(id, name, short_name, logo_url)
    `
    )
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (matchErr) {
    logger.error('[caster/matches/:id] match error:', matchErr);
    res.status(500).json({ error: 'Failed to load match' });
    return;
  }
  if (!match) {
    res.status(404).json({ error: 'Match not found' });
    return;
  }

  const { data: games, error: gamesErr } = await supabaseAdmin
    .from('games')
    .select('id, map_name, map_order, team1_score, team2_score')
    .eq('match_id', id)
    .eq('tenant_id', tenantId)
    .order('map_order', { ascending: true });

  if (gamesErr) {
    logger.error('[caster/matches/:id] games error:', gamesErr);
    res.status(500).json({ error: 'Failed to load games' });
    return;
  }

  res.status(200).json({ match, games: games ?? [] });
}
