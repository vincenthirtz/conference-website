// utils/twitch.ts
//
// Wrapper minimal autour de l'API Helix de Twitch :
//   - cache du token App (client_credentials) avec buffer 1min
//   - fetchTwitchLiveStatus(channels[]) -> map<login, LiveStatus>
//
// Partage entre /api/twitch/live (web, requires channels param) et
// /api/bot/v1/twitch/live (bot, lit tous les channels enregistres en
// auto). Le code original lived dans /api/twitch/live ; on l'extrait
// pour pouvoir l'utiliser cote bot sans dupliquer la logique du token.

import { logger } from './logger';

export type TwitchLiveStatus = {
  live: boolean;
  title?: string;
  viewerCount?: number;
  gameName?: string;
  startedAt?: string;
};

let cachedToken: { token: string; expiresAt: number } | null = null;

function clientCreds(): { id: string; secret: string } | null {
  const id = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) return null;
  return { id, secret };
}

async function getAccessToken(): Promise<string | null> {
  const creds = clientCreds();
  if (!creds) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const params = new URLSearchParams({
    client_id: creds.id,
    client_secret: creds.secret,
    grant_type: 'client_credentials',
  });

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    logger.error('[twitch] token fetch failed', res.status);
    return null;
  }
  const json = await res.json();
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + Number(json.expires_in ?? 0) * 1000,
  };
  return cachedToken.token;
}

/**
 * Returns a map keyed on lowercased user_login, with offline channels
 * filled in as { live: false }. Returns null if Twitch is misconfigured.
 */
export async function fetchTwitchLiveStatus(
  channels: string[]
): Promise<Record<string, TwitchLiveStatus> | null> {
  const creds = clientCreds();
  if (!creds) return null;
  const clean = channels
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c.length > 0);
  if (clean.length === 0) return {};
  if (clean.length > 100) {
    logger.error('[twitch] too many channels:', clean.length);
    clean.splice(100);
  }

  const token = await getAccessToken();
  if (!token) return null;

  const search = new URLSearchParams();
  clean.forEach((c) => search.append('user_login', c));

  const resp = await fetch(
    `https://api.twitch.tv/helix/streams?${search.toString()}`,
    {
      headers: {
        'Client-ID': creds.id,
        Authorization: `Bearer ${token}`,
      },
    }
  );
  if (!resp.ok) {
    logger.error('[twitch] streams error', resp.status);
    return null;
  }
  const data = await resp.json();

  const result: Record<string, TwitchLiveStatus> = {};
  for (const stream of (data?.data ?? []) as Array<{
    user_login?: string;
    title?: string;
    viewer_count?: number;
    game_name?: string;
    started_at?: string;
  }>) {
    const login = stream.user_login?.toLowerCase();
    if (!login) continue;
    result[login] = {
      live: true,
      title: stream.title,
      viewerCount: stream.viewer_count,
      gameName: stream.game_name,
      startedAt: stream.started_at,
    };
  }
  for (const c of clean) {
    if (!result[c]) result[c] = { live: false };
  }
  return result;
}
