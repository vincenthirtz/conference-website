// pages/api/twitch/exchange.ts
// Server-side Twitch OAuth `authorization_code` exchange.
//
// The Electron caster app used to do this exchange client-side, which forced
// TWITCH_CLIENT_SECRET into the distributed binary. We move it here so the
// secret never leaves the server. Reuses the SAME Twitch application as the
// site (TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET via clientCreds()).

import type { NextApiRequest, NextApiResponse } from 'next';
import { applyRateLimit } from '@/utils/rateLimit';
import { clientCreds } from '@/utils/twitch';
import { logger } from '@/utils/logger';

type TwitchTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string[] | string;
  token_type: string;
};

type ErrorResponse = { error: string; code?: string };

const TOKEN_ENDPOINT = 'https://id.twitch.tv/oauth2/token';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TwitchTokenResponse | ErrorResponse>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'twitch-exchange')
  )
    return;

  const body = (req.body ?? {}) as { code?: unknown; redirectUri?: unknown };

  if (!isNonEmptyString(body.code)) {
    return res
      .status(400)
      .json({ error: 'Invalid `code`', code: 'INVALID_CODE' });
  }
  if (!isValidUrl(body.redirectUri)) {
    return res
      .status(400)
      .json({ error: 'Invalid `redirectUri`', code: 'INVALID_REDIRECT_URI' });
  }

  const code: string = body.code;
  const redirectUri: string = body.redirectUri;

  const creds = clientCreds();
  if (!creds) {
    logger.error('[twitch/exchange] missing Twitch credentials');
    return res.status(500).json({
      error: 'Twitch is not configured',
      code: 'TWITCH_NOT_CONFIGURED',
    });
  }

  const params = new URLSearchParams({
    client_id: creds.id,
    client_secret: creds.secret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  try {
    const upstream = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!upstream.ok) {
      logger.error('[twitch/exchange] upstream non-OK', upstream.status);
      return res.status(502).json({
        error: 'Twitch token exchange failed',
        code: 'TWITCH_EXCHANGE_FAILED',
      });
    }

    const json = (await upstream.json()) as TwitchTokenResponse;

    return res.status(200).json({
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_in: json.expires_in,
      scope: json.scope,
      token_type: json.token_type,
    });
  } catch (err) {
    logger.error('[twitch/exchange] network error', err);
    return res.status(502).json({
      error: 'Twitch token exchange failed',
      code: 'TWITCH_EXCHANGE_FAILED',
    });
  }
}
