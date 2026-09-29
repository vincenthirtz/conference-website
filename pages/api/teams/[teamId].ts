// pages/api/teams/[teamId].ts
// GET : fiche PUBLIQUE d'une équipe par id (route anonyme, cache CDN).
//
// Lot P0 · S3 (docs/PLAN-industrialisation-joueur.md) : la route faisait un
// `select('*')` via le service role — elle exposait `captain_id`, les
// identifiants Discord internes, `deleted_at`, `is_active`, et servait les
// équipes supprimées. Toute colonne future aurait fui d'office. Les colonnes
// sont désormais listées une à une : en ajouter une est une décision.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { isValidUUID } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';
import { resolveTenantIdForPublicRequestAsync } from '@/utils/tenant';

import { logger } from '../../../utils/logger';

/**
 * Colonnes EXPOSÉES — celles que rend déjà la fiche publique `/team/[slug]`.
 * Jamais : `captain_id`, `discord_role_id`, `discord_channel_id`,
 * `discord_voice_channel_id`, `deleted_at`, `is_active`, `tenant_id`,
 * `tcg_image_path` (chemin de stockage), `preferred_locale`, `updated_at`.
 */
const PUBLIC_TEAM_COLUMNS = [
  'id',
  'name',
  'short_name',
  'slug',
  'logo_url',
  'logo_credit_name',
  'logo_credit_url',
  'banner_url',
  'banner_focal',
  'banner_overlay',
  'accent_color',
  'secondary_color',
  'country',
  'description',
  'achievements',
  'public_content',
  'sponsors',
  'embed_provider',
  'embed_id',
  'pinned_announcement',
  'pinned_announcement_until',
  'skill_rating',
  'is_joinable',
  'open_for_scrim',
  'discord',
  'twitter',
  'twitch',
  'youtube',
  'instagram',
  'tiktok',
  'website',
  'created_at',
] as const;

type PublicTeamColumn = (typeof PUBLIC_TEAM_COLUMNS)[number];

/** Lues pour décider du 404, jamais renvoyées. */
const VISIBILITY_COLUMNS = ['deleted_at', 'is_active'] as const;

const TEAM_SELECT = [...PUBLIC_TEAM_COLUMNS, ...VISIBILITY_COLUMNS].join(', ');

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'team-detail'))
    return;
  const { teamId } = req.query;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!teamId || Array.isArray(teamId) || !isValidUUID(teamId)) {
    return res.status(400).json({ error: 'Invalid team id' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin non configuré' });
  }

  const tenantId = await resolveTenantIdForPublicRequestAsync(req);

  const { data, error } = await supabaseAdmin
    .from('teams')
    .select(TEAM_SELECT)
    .eq('id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) {
    logger.error('GET team error:', error);
    return res.status(404).json({ error: 'Team not found' });
  }

  const row = data as Record<string, unknown> | null;
  // Supprimée ou désactivée : indiscernable d'une équipe inexistante.
  if (!row || row.deleted_at != null || row.is_active === false) {
    return res.status(404).json({ error: 'Team not found' });
  }

  const team = {} as Record<PublicTeamColumn, unknown>;
  for (const column of PUBLIC_TEAM_COLUMNS) {
    team[column] = row[column] ?? null;
  }

  res.setHeader(
    'Cache-Control',
    'public, s-maxage=300, stale-while-revalidate=120'
  );
  return res.status(200).json({ team });
}
