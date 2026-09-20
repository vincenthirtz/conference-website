// utils/twitch.ts
//
// Wrapper minimal autour de l'API Helix de Twitch :
//   - cache du token App (client_credentials) avec buffer 1min
//   - fetchTwitchLiveStatus(channels[]) -> map<login, LiveStatus>
//   - fetchTwitchProfileImages(channels[]) -> map<login, url>
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
  /**
   * Avatar de la chaîne. Vient d'un appel Helix SÉPARÉ (`/users`) : l'endpoint
   * `/streams` ne le renvoie pas. Absent si l'appel échoue — l'affichage doit
   * dégrader, jamais échouer pour une image.
   */
  profileImageUrl?: string;
};

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Reads the shared Twitch application credentials from env.
 * Returns null if either var is missing (caller decides how to surface that
 * without leaking which one is absent). Exported so the server-side OAuth
 * exchange/refresh routes reuse the exact same source of creds.
 */
export function clientCreds(): { id: string; secret: string } | null {
  const id = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) return null;
  return { id, secret };
}

/**
 * Jeton d'APPLICATION (`client_credentials`), mis en cache avec une marge d'une
 * minute.
 *
 * EXPORTÉ pour `pages/api/admin/twitch/eventsub/tcg-drop.ts` : un abonnement
 * EventSub en transport **webhook** exige ce jeton-là, là où le transport
 * websocket veut un jeton UTILISATEUR. L'inversion est contre-intuitive, et s'y
 * tromper rend un 401 que rien n'explique — d'où cette note plutôt qu'un
 * second helper qui aurait redemandé un jeton à chaque appel.
 */
export async function getAccessToken(): Promise<string | null> {
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

/**
 * Avatars des chaînes données : `map<login (minuscule), profile_image_url>`.
 *
 * Appel Helix distinct de `/streams`, qui ne porte pas cette information. Ne
 * renvoie JAMAIS null : une erreur donne une map vide, parce qu'une vignette
 * manquante ne doit pas priver l'appelant du statut live lui-même.
 */
export async function fetchTwitchProfileImages(
  channels: string[]
): Promise<Record<string, string>> {
  const creds = clientCreds();
  if (!creds) return {};
  const clean = channels
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c.length > 0)
    // Helix plafonne à 100 logins par appel, comme /streams.
    .slice(0, 100);
  if (clean.length === 0) return {};

  const token = await getAccessToken();
  if (!token) return {};

  const search = new URLSearchParams();
  clean.forEach((c) => search.append('login', c));

  try {
    const resp = await fetch(
      `https://api.twitch.tv/helix/users?${search.toString()}`,
      {
        headers: {
          'Client-ID': creds.id,
          Authorization: `Bearer ${token}`,
        },
      }
    );
    if (!resp.ok) {
      logger.error('[twitch] users error', resp.status);
      return {};
    }
    const data = await resp.json();
    const out: Record<string, string> = {};
    for (const user of (data?.data ?? []) as Array<{
      login?: string;
      profile_image_url?: string;
    }>) {
      const login = user.login?.toLowerCase();
      if (login && user.profile_image_url) out[login] = user.profile_image_url;
    }
    return out;
  } catch (err) {
    logger.error('[twitch] users fetch failed', err);
    return {};
  }
}

/* -----------------------------------------------------------
 * Clips
 * ---------------------------------------------------------*/

export type TwitchClip = {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  viewCount: number;
  createdAt: string;
  /** Durée en secondes, telle que Twitch la donne. */
  duration: number;
  creatorName: string | null;
};

/** Identifiant Helix d'une chaîne, par login. Vide si l'appel échoue. */
async function fetchBroadcasterId(login: string): Promise<string | null> {
  const creds = clientCreds();
  const token = await getAccessToken();
  if (!creds || !token) return null;
  try {
    const resp = await fetch(
      `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`,
      { headers: { 'Client-ID': creds.id, Authorization: `Bearer ${token}` } }
    );
    if (!resp.ok) {
      logger.error('[twitch] users (clips) error', resp.status);
      return null;
    }
    const data = await resp.json();
    return (data?.data?.[0]?.id as string | undefined) ?? null;
  } catch (e) {
    logger.error('[twitch] users (clips) exception', e);
    return null;
  }
}

/**
 * Les clips les plus vus d'une chaîne sur les `days` derniers jours.
 *
 * FENÊTRE GLISSANTE, et pas le palmarès de tous les temps : la home montre « la
 * chaîne en ce moment ». Sans `started_at`, Helix renverrait éternellement le
 * même clip de 2025, et le bloc cesserait de vouloir dire quoi que ce soit.
 *
 * Ne lève jamais : sans identifiants, sans réseau ou sur une erreur Helix, on
 * renvoie une liste vide et l'appelant n'affiche rien.
 */
export async function fetchTwitchClips(
  channel: string,
  opts: { limit?: number; days?: number } = {}
): Promise<TwitchClip[]> {
  const login = channel.trim().toLowerCase();
  if (!login) return [];
  const limit = Math.min(20, Math.max(1, opts.limit ?? 4));
  const days = Math.min(365, Math.max(1, opts.days ?? 30));

  const creds = clientCreds();
  const token = await getAccessToken();
  if (!creds || !token) return [];

  const broadcasterId = await fetchBroadcasterId(login);
  if (!broadcasterId) return [];

  const startedAt = new Date(Date.now() - days * 86_400_000).toISOString();
  const search = new URLSearchParams({
    broadcaster_id: broadcasterId,
    first: String(limit),
    started_at: startedAt,
  });

  try {
    const resp = await fetch(
      `https://api.twitch.tv/helix/clips?${search.toString()}`,
      { headers: { 'Client-ID': creds.id, Authorization: `Bearer ${token}` } }
    );
    if (!resp.ok) {
      logger.error('[twitch] clips error', resp.status);
      return [];
    }
    const data = await resp.json();
    return ((data?.data ?? []) as Array<Record<string, unknown>>)
      .map((c) => ({
        id: String(c.id ?? ''),
        title: String(c.title ?? '').trim(),
        url: String(c.url ?? ''),
        // Helix rend un gabarit `%{width}x%{height}` sur certains clips.
        thumbnailUrl: String(c.thumbnail_url ?? '')
          .replace('%{width}', '480')
          .replace('%{height}', '272'),
        viewCount: Number(c.view_count ?? 0),
        createdAt: String(c.created_at ?? ''),
        duration: Number(c.duration ?? 0),
        creatorName: (c.creator_name as string | undefined)?.trim() || null,
      }))
      .filter((c) => c.id && c.url && c.thumbnailUrl.startsWith('https://'));
  } catch (e) {
    logger.error('[twitch] clips exception', e);
    return [];
  }
}
