// GET /api/auth/twitch/start
//
// Démarre le rattachement d'un compte Twitch à un compte du site — ce qui
// permet ensuite d'attribuer un drop TCG réclamé en direct.
//
// Navigation PLEINE PAGE (le navigateur suit le 302), donc l'authentification
// vient de la session cookie Supabase, pas d'un Bearer : même choix que
// `/api/auth/battlenet/start`, et pour la même raison — un en-tête
// d'autorisation ne survit pas à une redirection.
//
// - 401 si aucune session joueuse.
// - 503 { code: 'TWITCH_IDENTITY_NOT_CONFIGURED' } si la fonctionnalité est
//   dormante. On ne révèle PAS laquelle des variables manque.
// - Sinon : cookie httpOnly court (nonce CSRF), state signé (nonce + compte +
//   returnTo), puis 302 vers Twitch.
//
// AUCUN SCOPE N'EST DEMANDÉ : on veut savoir qui vient, pas agir en son nom.
// Cf. l'en-tête de `utils/twitchIdentity.ts`.

import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';

import { getServerClient } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import {
  isTwitchIdentityConfigured,
  buildTwitchIdentityAuthorizeUrl,
  signTwitchIdentityState,
  generateStateNonce,
} from '@/utils/twitchIdentity';

export const STATE_COOKIE = 'tw_id_oauth_state';
const STATE_COOKIE_MAX_AGE = 600; // 10 minutes, en secondes
const DEFAULT_RETURN_TO = '/player/profile';

/** N'accepte qu'un chemin interne relatif (anti open-redirect). */
function sanitizeReturnTo(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_RETURN_TO;
  const value = raw.trim();
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return DEFAULT_RETURN_TO;
  }
  return value;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'twitch-link'))
    return;

  if (!isTwitchIdentityConfigured()) {
    return res.status(503).json({
      error: 'Liaison Twitch indisponible.',
      code: 'TWITCH_IDENTITY_NOT_CONFIGURED',
    });
  }

  const supabase = getServerClient(req, res);
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return res.status(401).json({ error: 'Non authentifié' });
  }

  const returnTo = sanitizeReturnTo(req.query.returnTo);
  const nonce = generateStateNonce();
  const state = signTwitchIdentityState({
    nonce,
    authUserId: user.id,
    returnTo,
  });

  res.setHeader(
    'Set-Cookie',
    serialize(STATE_COOKIE, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: STATE_COOKIE_MAX_AGE,
    })
  );

  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Location', buildTwitchIdentityAuthorizeUrl(state));
  return res.status(302).end();
}
