// GET /api/admin/twitch/connect
//
// Démarre le flux OAuth « broadcaster » Twitch pour connecter la chaîne du
// tenant (actions écrivantes régie : predictions, puis modération/points/chat).
//
// Contrairement à un start OAuth en navigation pleine page, l'UI régie ouvre
// l'autorize dans une popup / redirection contrôlée : on renvoie donc l'URL en
// JSON (au lieu d'un 302) après avoir posé un cookie httpOnly nonce
// (double-submit CSRF) et signé un state opaque (tenant + user + returnTo).
//
// - withStaffRoute(..., 'manager') : même seuil que les writes régie.
// - 503 { code:'TWITCH_NOT_CONFIGURED' } si la feature est dormante.

import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';
import { applyRateLimit } from '@/utils/rateLimit';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import {
  isTwitchBroadcasterConfigured,
  buildBroadcasterAuthorizeUrl,
  signState,
  generateStateNonce,
} from '@/utils/twitchBroadcaster';

export const STATE_COOKIE = 'tw_bc_oauth_state';
const STATE_COOKIE_MAX_AGE = 600; // 10 minutes, en secondes
const DEFAULT_RETURN_TO = '/admin/broadcast/live';

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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'twitch-connect'))
    return;

  if (!isTwitchBroadcasterConfigured()) {
    return res.status(503).json({
      error: "La connexion Twitch broadcaster n'est pas configurée.",
      code: 'TWITCH_NOT_CONFIGURED',
    });
  }

  const returnTo = sanitizeReturnTo(req.query.returnTo);
  const nonce = generateStateNonce();
  const state = signState({
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    nonce,
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
  return res.status(200).json({ url: buildBroadcasterAuthorizeUrl(state) });
}

export default withStaffRoute(handler, 'manager');
