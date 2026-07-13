// pages/api/player/follows/index.ts
//
// POST   /api/player/follows   { followeeId }  -> suivre (idempotent)
// DELETE /api/player/follows   { followeeId }  -> ne plus suivre (idempotent)
// GET    /api/player/follows?type=following|followers&limit&offset
//
// Suivi joueur cross-tenant, DERRIÈRE LE LOGIN (withAuthRoute). La table
// player_follows est RLS service-role only : tout passe par supabaseAdmin, scopé
// manuellement sur ctx.user.id.
//
// RÈGLE PRODUIT (kill-switch fort) : on ne peut suivre QU'UN joueur
// DÉCOUVRABLE, et les listes ne renvoient QUE des joueurs actuellement
// découvrables. Un opt-out (discoverable=false) fait disparaître le joueur des
// listes de tout le monde, sans supprimer l'arête player_follows (réapparaît
// s'il redevient découvrable).
//
// - POST : rejette l'auto-suivi (CANNOT_FOLLOW_SELF), vérifie que la cible a une
//   ligne player_discovery_profiles discoverable=true (sinon 404 NOT_DISCOVERABLE
//   — pas de fuite d'énumération), puis upsert idempotent onConflict
//   (follower_id, followee_id).
// - DELETE : delete idempotent scopé follower_id=me.
// - GET : joint player_follows -> player_discovery_profiles (discoverable=true) et
//   enrichit chaque joueur comme l'annuaire (utils/playerDiscoveryEnrich).

import type { NextApiRequest, NextApiResponse } from 'next';
import type { User } from '@supabase/supabase-js';
import { z } from 'zod';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { logger } from '@/utils/logger';
import {
  buildDirectoryPlayers,
  type DiscoveryProfileRow,
} from '@/utils/playerDiscoveryEnrich';

const followBodySchema = z.object({
  followeeId: z.string().uuid(),
});

const listQuerySchema = z.object({
  type: z.enum(['following', 'followers']).default('following'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const PROFILE_COLS =
  'auth_user_id, display_name, avatar_url, tagline, show_ratings, show_teams';

/** POST — suivre un joueur découvrable (idempotent). */
async function handleFollow(
  req: NextApiRequest,
  res: NextApiResponse,
  callerId: string
) {
  const parsed = followBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation échouée.',
      code: 'INVALID_BODY',
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const { followeeId } = parsed.data;

  if (followeeId === callerId) {
    return res.status(400).json({
      error: 'On ne peut pas se suivre soi-même.',
      code: 'CANNOT_FOLLOW_SELF',
    });
  }

  // La cible doit exister ET être actuellement découvrable. On ne distingue pas
  // « inconnu » de « non découvrable » côté client (404 unique) : pas de fuite
  // d'énumération.
  const { data: target, error: targetError } = await supabaseAdmin!
    .from('player_discovery_profiles')
    .select('auth_user_id')
    .eq('auth_user_id', followeeId)
    .eq('discoverable', true)
    .maybeSingle();
  if (targetError) {
    logger.error('[player/follows] POST target lookup error', targetError);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
  if (!target) {
    return res.status(404).json({
      error: 'Joueur introuvable ou non découvrable.',
      code: 'NOT_DISCOVERABLE',
    });
  }

  // Insert idempotent : onConflict (follower_id, followee_id) ignore les doublons.
  const { error: upsertError } = await supabaseAdmin!
    .from('player_follows')
    .upsert(
      {
        follower_id: callerId,
        followee_id: followeeId,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'follower_id,followee_id', ignoreDuplicates: true }
    );
  if (upsertError) {
    logger.error('[player/follows] POST upsert error', upsertError);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }

  return res.status(200).json({ following: true });
}

/** DELETE — ne plus suivre (idempotent). */
async function handleUnfollow(
  req: NextApiRequest,
  res: NextApiResponse,
  callerId: string
) {
  const parsed = followBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation échouée.',
      code: 'INVALID_BODY',
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const { followeeId } = parsed.data;

  const { error: deleteError } = await supabaseAdmin!
    .from('player_follows')
    .delete()
    .eq('follower_id', callerId)
    .eq('followee_id', followeeId);
  if (deleteError) {
    logger.error('[player/follows] DELETE error', deleteError);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }

  return res.status(200).json({ following: false });
}

/** GET — liste following (joueurs que je suis) ou followers (qui me suivent). */
async function handleList(
  req: NextApiRequest,
  res: NextApiResponse,
  callerId: string
) {
  const parsed = listQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation échouée.',
      code: 'INVALID_QUERY',
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const { type, limit, offset } = parsed.data;

  // Arêtes du caller. following : rows follower_id=me → on veut leurs followee_id.
  // followers : rows followee_id=me → on veut leurs follower_id.
  const edgeCol = type === 'following' ? 'follower_id' : 'followee_id';
  const otherCol = type === 'following' ? 'followee_id' : 'follower_id';

  const { data: edges, error: edgeError } = await supabaseAdmin!
    .from('player_follows')
    .select(`${edgeCol}, ${otherCol}`)
    .eq(edgeCol, callerId);
  if (edgeError) {
    logger.error('[player/follows] GET edges error', edgeError);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }

  const otherIds = Array.from(
    new Set(
      ((edges as Array<Record<string, string>> | null) ?? [])
        .map((e) => e[otherCol])
        .filter((id): id is string => Boolean(id))
    )
  );

  if (otherIds.length === 0) {
    return res.status(200).json({ players: [], total: 0, limit, offset, type });
  }

  // On ne renvoie QUE les joueurs actuellement découvrables (opt-out disparaît).
  const { data: profileRows, error: profileError } = await supabaseAdmin!
    .from('player_discovery_profiles')
    .select(PROFILE_COLS)
    .in('auth_user_id', otherIds)
    .eq('discoverable', true)
    .order('updated_at', { ascending: false });
  if (profileError) {
    logger.error('[player/follows] GET profiles error', profileError);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }

  const allRows = (profileRows as DiscoveryProfileRow[] | null) ?? [];
  const total = allRows.length;
  const pageRows = allRows.slice(offset, offset + limit);

  let players;
  try {
    players = await buildDirectoryPlayers(pageRows, callerId);
  } catch (e) {
    logger.error('[player/follows] GET enrich error', e);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }

  return res.status(200).json({ players, total, limit, offset, type });
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: { user: User }
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'player-follows')
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  const callerId = ctx.user.id;

  if (req.method === 'GET') return handleList(req, res, callerId);
  if (req.method === 'POST') return handleFollow(req, res, callerId);
  if (req.method === 'DELETE') return handleUnfollow(req, res, callerId);

  res.setHeader('Allow', 'GET,POST,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withAuthRoute(handler);
