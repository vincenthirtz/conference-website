import type { NextApiRequest, NextApiResponse } from 'next';

type LiveStatus = {
  live: boolean;
  title?: string;
  viewer_count?: number;
};

type LiveResponse =
  | { statuses: Record<string, LiveStatus> }
  | { error: string };

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken() {
  if (
    cachedToken &&
    cachedToken.expiresAt > Date.now() + 60 * 1000 // keep 1m buffer
  ) {
    return cachedToken.token;
  }

  const params = new URLSearchParams({
    client_id: CLIENT_ID || '',
    client_secret: CLIENT_SECRET || '',
    grant_type: 'client_credentials',
  });

  const res = await fetch(`https://id.twitch.tv/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Twitch token: ${res.status}`);
  }

  const json = await res.json();
  const expiresIn = Number(json.expires_in || 0) * 1000;
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + expiresIn,
  };

  return cachedToken.token;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LiveResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).json({
      error: 'Twitch API credentials missing (TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET)',
    });
  }

  const channelsParam = req.query.channels;
  const channels = Array.isArray(channelsParam)
    ? channelsParam.flatMap((c) => c.split(','))
    : (channelsParam || '').toString().split(',');

  const cleanChannels = channels
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

  if (cleanChannels.length === 0) {
    return res.status(400).json({ error: 'channels query param required' });
  }

  try {
    const token = await getAccessToken();
    const search = new URLSearchParams();
    cleanChannels.forEach((c) => search.append('user_login', c));

    const resp = await fetch(
      `https://api.twitch.tv/helix/streams?${search.toString()}`,
      {
        headers: {
          'Client-ID': CLIENT_ID,
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!resp.ok) {
      throw new Error(`Twitch streams error ${resp.status}`);
    }

    const data = await resp.json();
    const liveMap: Record<string, LiveStatus> = {};
    data.data?.forEach((stream: any) => {
      const userLogin = (stream.user_login as string | undefined)?.toLowerCase();
      if (userLogin) {
        liveMap[userLogin] = {
          live: true,
          title: stream.title,
          viewer_count: stream.viewer_count,
        };
      }
    });

    // Mark offline ones
    cleanChannels.forEach((ch) => {
      if (!liveMap[ch]) {
        liveMap[ch] = { live: false };
      }
    });

    return res.status(200).json({ statuses: liveMap });
  } catch (err: any) {
    console.error('[/api/twitch/live] error:', err);
    return res
      .status(500)
      .json({ error: err?.message || 'Failed to check live status' });
  }
}
