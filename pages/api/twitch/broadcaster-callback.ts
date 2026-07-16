// GET /api/twitch/broadcaster-callback
//
// Retour du flux OAuth broadcaster Twitch. PUBLIC (le navigateur y arrive via un
// 302 de Twitch), mais protégé par un state SIGNÉ (HMAC) + cookie nonce
// double-submit : aucune session cookie n'est requise ici, la confiance vient
// entièrement du state signé émis par /api/admin/twitch/connect.
//
// Déroulé :
//   1. verifyState (signature + TTL) + comparaison au cookie nonce.
//   2. exchangeBroadcasterCode(code) → tokens broadcaster.
//   3. GET helix/users (Bearer) → broadcaster_id + login.
//   4. storeConnection (tokens CHIFFRÉS, UPSERT sur tenant_id).
//   5. redirige 302 vers returnTo avec ?twitch=connected | ?twitch=error.
//
// SÉCURITÉ : jamais de token dans l'URL/redirect. Toute erreur → ?twitch=error +
// log serveur (sans secret).

import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { getStaffByUserId } from '@/utils/staff';
import { logger } from '@/utils/logger';
import {
  isTwitchBroadcasterConfigured,
  verifyState,
  exchangeBroadcasterCode,
  storeConnection,
  helixFetch,
} from '@/utils/twitchBroadcaster';
import { STATE_COOKIE } from '../admin/twitch/connect';

const DEFAULT_RETURN_TO = '/admin/broadcast/live';

type TwitchStatus = 'connected' | 'error';

function sanitizeReturnTo(raw: string | undefined): string {
  if (!raw || typeof raw !== 'string') return DEFAULT_RETURN_TO;
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

function withStatus(returnTo: string, status: TwitchStatus): string {
  const sep = returnTo.includes('?') ? '&' : '?';
  return `${returnTo}${sep}twitch=${status}`;
}

function clearStateCookie(res: NextApiResponse): void {
  res.setHeader(
    'Set-Cookie',
    serialize(STATE_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })
  );
}

function redirect(res: NextApiResponse, url: string): void {
  res.setHeader('Location', url);
  res.status(302).end();
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
    applyRateLimit(
      req,
      res,
      { max: 20, windowMs: 60_000 },
      'twitch-bc-callback'
    )
  )
    return;

  if (!isTwitchBroadcasterConfigured()) {
    return res.status(503).json({
      error: "La connexion Twitch broadcaster n'est pas configurée.",
      code: 'TWITCH_NOT_CONFIGURED',
    });
  }

  if (!supabaseAdmin) {
    logger.error('[twitch/broadcaster-callback] missing service role');
    return redirect(res, withStatus(DEFAULT_RETURN_TO, 'error'));
  }
  const admin = supabaseAdmin;

  // Valide le state signé (CSRF + binding) contre le cookie nonce.
  const stateParam =
    typeof req.query.state === 'string' ? req.query.state : undefined;
  const payload = verifyState(stateParam);
  const cookieNonce = req.cookies?.[STATE_COOKIE];
  clearStateCookie(res);

  if (!payload || !cookieNonce || payload.nonce !== cookieNonce) {
    logger.error('[twitch/broadcaster-callback] invalid state/nonce');
    return redirect(res, withStatus(DEFAULT_RETURN_TO, 'error'));
  }

  const returnTo = sanitizeReturnTo(payload.returnTo);

  // Twitch a renvoyé une erreur (refus de consentement, etc.).
  if (typeof req.query.error === 'string' && req.query.error) {
    logger.error(
      '[twitch/broadcaster-callback] provider error',
      req.query.error
    );
    return redirect(res, withStatus(returnTo, 'error'));
  }

  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!code) {
    return redirect(res, withStatus(returnTo, 'error'));
  }

  try {
    const token = await exchangeBroadcasterCode(code);

    // Identité du broadcaster connecté.
    const usersRes = await helixFetch(token.accessToken, '/users');
    if (!usersRes.ok) {
      logger.error(
        '[twitch/broadcaster-callback] helix/users non-OK',
        usersRes.status
      );
      return redirect(res, withStatus(returnTo, 'error'));
    }
    const usersJson = (await usersRes.json()) as {
      data?: Array<{ id?: string; login?: string }>;
    };
    const me = usersJson?.data?.[0];
    if (!me?.id || !me?.login) {
      logger.error('[twitch/broadcaster-callback] helix/users empty payload');
      return redirect(res, withStatus(returnTo, 'error'));
    }

    const { error: storeErr } = await storeConnection(admin, {
      tenantId: payload.tenantId,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresIn: token.expiresIn,
      scope: token.scope,
      broadcasterId: me.id,
      login: me.login,
      userId: payload.userId,
    });
    if (storeErr) {
      logger.error('[twitch/broadcaster-callback] store error', storeErr);
      return redirect(res, withStatus(returnTo, 'error'));
    }

    // Audit best-effort (le staff peut ne plus exister — best-effort seulement).
    try {
      const staff = await getStaffByUserId(payload.userId);
      if (staff?.id) {
        await logStaffAction({
          staff_id: staff.id,
          action: 'other',
          entity_type: 'twitch_broadcaster_connection',
          entity_id: payload.tenantId,
          tenant_id: payload.tenantId,
          payload: {
            action: 'connect_twitch_broadcaster',
            broadcaster_login: me.login,
            scopeCount: token.scope.length,
          },
        });
      }
    } catch (logErr) {
      logger.error('[twitch/broadcaster-callback] audit log error', logErr);
    }

    return redirect(res, withStatus(returnTo, 'connected'));
  } catch (err) {
    logger.error('[twitch/broadcaster-callback] flow error', err);
    return redirect(res, withStatus(returnTo, 'error'));
  }
}
