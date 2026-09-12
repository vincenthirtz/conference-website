// pages/api/player/discovery/profile.ts
//
// GET /api/player/discovery/profile?userId=<uuid>
//   -> { discoverable: false }
//   -> { discoverable: true, isFollowing, followerCount, teams }
//
// POURQUOI CETTE ROUTE. Le graphe de suivi existe (player_follows), le bouton
// existe (components/player/FollowButton), l'annuaire existe — mais rien ne
// permettait de répondre la question la plus simple du réseau : « CETTE
// joueuse-là, je peux la suivre, et est-ce que je la suis déjà ? ». La
// recherche (`search.ts`) cherche par NOM et ne sait pas répondre pour un id
// donné. Résultat : le profil public, seule page réellement visitée et
// partagée, restait un cul-de-sac social (lot 1 de docs/BACKLOG-reseau-social.md).
//
// ANTI-ÉNUMÉRATION. Une joueuse qui n'a pas activé la découverte, un compte qui
// n'existe pas et un id malformé renvoient TOUS la même chose : un 200
// `{ discoverable: false }`. Jamais 404 sur l'un et 200 sur l'autre — sinon
// cette route devient un oracle qui dit qui possède un compte, exactement ce
// que `follows/index.ts` évite déjà avec son 404 NOT_DISCOVERABLE uniforme.
//
// DERRIÈRE LE LOGIN. `withAuthRoute` : la page /player/[userId] est publique et
// indexable, mais la couche sociale ne s'y affiche que pour une visiteuse
// connectée. Aucune donnée d'opt-in ne doit apparaître dans le HTML servi à un
// robot.

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

const querySchema = z.object({ userId: z.string().uuid() });

const PROFILE_COLS =
  'auth_user_id, display_name, avatar_url, tagline, show_ratings, show_teams';

/** Réponse unique du cas « rien à montrer », quelle qu'en soit la raison. */
const HIDDEN = { discoverable: false as const };

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: { user: User }
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'discovery-profile')
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = querySchema.safeParse(req.query ?? {});
  // Un id malformé n'est pas une erreur de validation à signaler : le répondre
  // distinguerait « id invalide » de « joueuse invisible ».
  if (!parsed.success) return res.status(200).json(HIDDEN);

  const { userId } = parsed.data;

  const { data: row, error } = await supabaseAdmin!
    .from('player_discovery_profiles')
    .select(PROFILE_COLS)
    .eq('auth_user_id', userId)
    .eq('discoverable', true)
    .maybeSingle();

  if (error) {
    logger.error('[player/discovery/profile] read error', error);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  if (!row) return res.status(200).json(HIDDEN);

  const [player] = await buildDirectoryPlayers(
    [row as DiscoveryProfileRow],
    ctx.user.id
  );
  if (!player) return res.status(200).json(HIDDEN);

  return res.status(200).json({
    discoverable: true,
    isFollowing: player.isFollowing,
    followerCount: player.followerCount,
    teams: player.teams ?? [],
  });
}

export default withAuthRoute(handler);
