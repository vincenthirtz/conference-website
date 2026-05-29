// pages/api/twitch/refresh.ts
// Server-side Twitch OAuth `refresh_token` grant.
//
// Companion to /api/twitch/exchange. Keeps TWITCH_CLIENT_SECRET on the server
// when the caster app needs to refresh an expired access token. Reuses the
// SAME Twitch application as the site (clientCreds()).

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TwitchTokenResponse | ErrorResponse>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'twitch-refresh'))
    return;

  const body = (req.body ?? {}) as { refresh_token?: unknown };

  if (!isNonEmptyString(body.refresh_token)) {
    return res
      .status(400)
      .json({
        error: 'Invalid `refresh_token`',
        code: 'INVALID_REFRESH_TOKEN',
      });
  }

  const refreshToken: string = body.refresh_token;

  const creds = clientCreds();
  if (!creds) {
    logger.error('[twitch/refresh] missing Twitch credentials');
    return res
      .status(500)
      .json({
        error: 'Twitch is not configured',
        code: 'TWITCH_NOT_CONFIGURED',
      });
  }

  const params = new URLSearchParams({
    client_id: creds.id,
    client_secret: creds.secret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  try {
    const upstream = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!upstream.ok) {
      logger.error('[twitch/refresh] upstream non-OK', upstream.status);
      return res.status(502).json({
        error: 'Twitch token refresh failed',
        code: 'TWITCH_REFRESH_FAILED',
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
    logger.error('[twitch/refresh] network error', err);
    return res.status(502).json({
      error: 'Twitch token refresh failed',
      code: 'TWITCH_REFRESH_FAILED',
    });
  }
}
