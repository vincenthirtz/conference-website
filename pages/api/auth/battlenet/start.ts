// GET /api/auth/battlenet/start
//
// Démarre le flux de vérification d'identité Battle.net (anti-smurf Tier 1).
// Navigation pleine page (le navigateur suit le 302), donc l'auth vient de la
// session cookie Supabase (getServerClient), pas d'un Bearer.
//
// - 401 si aucune session joueuse.
// - 503 { code: 'BATTLENET_NOT_CONFIGURED' } si la feature est dormante.
// - Sinon : pose un cookie httpOnly court (nonce CSRF), signe un state opaque
//   (nonce + auth_user_id + returnTo) et redirige (302) vers Blizzard.

import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';
import { getServerClient } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import {
  isBattlenetConfigured,
  buildAuthorizeUrl,
  signBattlenetState,
  generateStateNonce,
} from '@/utils/battlenet';

const STATE_COOKIE = 'bn_oauth_state';
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

function appendSetCookie(res: NextApiResponse, cookie: string): void {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', cookie);
  } else if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookie]);
  } else {
    res.setHeader('Set-Cookie', [existing.toString(), cookie]);
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'battlenet-start')
  )
    return;

  const supabase = getServerClient(req, res);
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return res.status(401).json({ error: 'Non authentifié' });
  }

  if (!isBattlenetConfigured()) {
    return res.status(503).json({
      error: "La vérification Battle.net n'est pas configurée.",
      code: 'BATTLENET_NOT_CONFIGURED',
    });
  }

  const returnTo = sanitizeReturnTo(req.query.returnTo);
  const nonce = generateStateNonce();
  const state = signBattlenetState({
    nonce,
    authUserId: user.id,
    returnTo,
  });

  appendSetCookie(
    res,
    serialize(STATE_COOKIE, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: STATE_COOKIE_MAX_AGE,
    })
  );

  res.setHeader('Location', buildAuthorizeUrl(state));
  return res.status(302).end();
}
