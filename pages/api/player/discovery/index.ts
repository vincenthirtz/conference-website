// pages/api/player/discovery/index.ts
//
// GET  /api/player/discovery
// PUT  /api/player/discovery
//
// Carte de découverte GLOBALE (cross-tenant) du joueur courant. Opt-in
// explicite, INVISIBLE PAR DÉFAUT, DERRIÈRE LE LOGIN (withAuthRoute). La table
// player_discovery_profiles est RLS service-role only (aucune policy) : tout
// l'accès passe par supabaseAdmin, scopé manuellement sur ctx.user.id.
//
// Convention « absent = défaut » (cf. notification_prefs) : une joueuse sans
// ligne est, par construction, NON découvrable (discoverable=false) mais expose
// les défauts de visibilité (showRatings=true, showTeams=true).
//
// opted_in_at (audit RGPD) : posé au PREMIER passage discoverable=true, JAMAIS
// effacé ensuite. Le « kill-switch » (repasser discoverable=false) conserve la
// ligne et l'horodatage de consentement.

import type { NextApiRequest, NextApiResponse } from 'next';
import type { User } from '@supabase/supabase-js';
import { z } from 'zod';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { logger } from '@/utils/logger';

/** Forme exposée de la carte de découverte (GET + PUT retournent l'identique). */
type DiscoveryCard = {
  discoverable: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  tagline: string | null;
  showRatings: boolean;
  showTeams: boolean;
  optedInAt: string | null;
};

/** Ligne brute de player_discovery_profiles telle que lue par le service-role. */
type DiscoveryRow = {
  auth_user_id: string;
  discoverable?: boolean | null;
  display_name?: string | null;
  avatar_url?: string | null;
  tagline?: string | null;
  show_ratings?: boolean | null;
  show_teams?: boolean | null;
  opted_in_at?: string | null;
};

const SELECT_COLS =
  'auth_user_id, discoverable, display_name, avatar_url, tagline, show_ratings, show_teams, opted_in_at';

const discoveryPutSchema = z.object({
  discoverable: z.boolean().optional(),
  displayName: z.string().max(80).nullable().optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
  tagline: z.string().max(160).nullable().optional(),
  showRatings: z.boolean().optional(),
  showTeams: z.boolean().optional(),
});

/**
 * Projette une ligne (ou son absence) vers la carte exposée, en appliquant les
 * défauts « invisible par défaut » : discoverable=false, show_ratings/show_teams
 * =true, tout le reste null.
 */
function toCard(row: DiscoveryRow | null): DiscoveryCard {
  return {
    discoverable: row?.discoverable ?? false,
    displayName: row?.display_name ?? null,
    avatarUrl: row?.avatar_url ?? null,
    tagline: row?.tagline ?? null,
    showRatings: row?.show_ratings ?? true,
    showTeams: row?.show_teams ?? true,
    optedInAt: row?.opted_in_at ?? null,
  };
}

/** Charge la ligne du joueur courant (ou null si aucune). */
async function loadRow(authUserId: string): Promise<DiscoveryRow | null> {
  const { data, error } = await supabaseAdmin!
    .from('player_discovery_profiles')
    .select(SELECT_COLS)
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error) {
    logger.error('[player/discovery] load error', error);
    throw new Error('Failed to load discovery profile');
  }
  return (data as DiscoveryRow | null) ?? null;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: { user: User }
) {
  const authUserId = ctx.user.id;

  if (req.method === 'GET') {
    if (
      applyRateLimit(
        req,
        res,
        { max: 60, windowMs: 60_000 },
        'player-discovery-get'
      )
    ) {
      return;
    }
    res.setHeader('Cache-Control', 'no-store');

    try {
      const row = await loadRow(authUserId);
      return res.status(200).json(toCard(row));
    } catch {
      return res.status(500).json({ error: 'Erreur serveur.' });
    }
  }

  if (req.method === 'PUT') {
    if (
      applyRateLimit(
        req,
        res,
        { max: 30, windowMs: 60_000 },
        'player-discovery-put'
      )
    ) {
      return;
    }
    res.setHeader('Cache-Control', 'no-store');

    const parsed = discoveryPutSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation échouée.',
        code: 'INVALID_BODY',
        fields: parsed.error.flatten().fieldErrors,
      });
    }

    const patch = parsed.data;

    let existing: DiscoveryRow | null;
    try {
      existing = await loadRow(authUserId);
    } catch {
      return res.status(500).json({ error: 'Erreur serveur.' });
    }

    // Valeur de `discoverable` résultante (patch partiel : on retombe sur
    // l'existant, sinon sur le défaut false).
    const resultingDiscoverable =
      patch.discoverable !== undefined
        ? patch.discoverable
        : (existing?.discoverable ?? false);

    // opted_in_at posé au PREMIER passage à true (existant sans horodatage),
    // jamais effacé ensuite (audit RGPD).
    const shouldSetOptedIn =
      resultingDiscoverable === true && !existing?.opted_in_at;

    // Upsert réel sur la PK mono-colonne auth_user_id (pas de delete-then-insert).
    const payload: Record<string, unknown> = {
      auth_user_id: authUserId,
      updated_at: new Date().toISOString(),
    };
    if (patch.discoverable !== undefined)
      payload.discoverable = patch.discoverable;
    if (patch.displayName !== undefined)
      payload.display_name = patch.displayName;
    if (patch.avatarUrl !== undefined) payload.avatar_url = patch.avatarUrl;
    if (patch.tagline !== undefined) payload.tagline = patch.tagline;
    if (patch.showRatings !== undefined)
      payload.show_ratings = patch.showRatings;
    if (patch.showTeams !== undefined) payload.show_teams = patch.showTeams;
    if (shouldSetOptedIn) payload.opted_in_at = new Date().toISOString();

    const { error: upsertError } = await supabaseAdmin!
      .from('player_discovery_profiles')
      .upsert(payload, { onConflict: 'auth_user_id' });

    if (upsertError) {
      logger.error('[player/discovery] PUT upsert error', upsertError);
      return res.status(500).json({ error: 'Erreur serveur.' });
    }

    try {
      const row = await loadRow(authUserId);
      return res.status(200).json(toCard(row));
    } catch {
      return res.status(500).json({ error: 'Erreur serveur.' });
    }
  }

  res.setHeader('Allow', 'GET,PUT');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withAuthRoute(handler);
