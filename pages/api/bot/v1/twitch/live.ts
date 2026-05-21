// GET /api/bot/v1/twitch/live
//
// Wrapper bot : combine la liste des channels Twitch enregistres dans
// twitch_channels (is_active=true) + le statut live courant depuis l'API
// Helix. Le bot recoit directement ce qui est en live, pret a afficher
// dans /lives — pas besoin de poll l'API Twitch lui-meme.
//
// Query :
//   - includeOffline : '1' ou 'true' pour renvoyer aussi les offline
//                      (defaut : seulement les live)
//
// Cache HTTP : 60s (le statut live change peu en sub-minute).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { fetchTwitchLiveStatus } from '@/utils/twitch';
import { logger } from '@/utils/logger';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const includeOffline =
    req.query.includeOffline === '1' || req.query.includeOffline === 'true';

  const { data: channelsData, error } = await supabaseAdmin
    .from('twitch_channels')
    .select('channel, label, badge, description, background_url')
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) {
    logger.error('[bot/twitch/live] channels error', error);
    return res.status(500).json({ error: 'Erreur de chargement des channels' });
  }
  const channels = (channelsData ?? []) as Array<{
    channel: string;
    label: string | null;
    badge: string | null;
    description: string | null;
    background_url: string | null;
  }>;

  if (channels.length === 0) {
    return res.status(200).json({ channels: [], total: 0, liveCount: 0 });
  }

  const statuses = await fetchTwitchLiveStatus(channels.map((c) => c.channel));
  if (statuses === null) {
    // Twitch mal configure (env vars manquantes) -> on degrade gracefully :
    // on renvoie la liste sans statut live plutot que de 500. Le bot saura
    // qu'aucun live n'est detecte (live: false partout).
    const fallback = channels.map((c) => ({
      channel: c.channel,
      label: c.label,
      badge: c.badge,
      description: c.description,
      backgroundUrl: c.background_url,
      live: false as const,
    }));
    return res
      .status(200)
      .json({ channels: fallback, total: fallback.length, liveCount: 0 });
  }

  const enriched = channels.map((c) => {
    const status = statuses[c.channel.toLowerCase()] ?? { live: false };
    return {
      channel: c.channel,
      label: c.label,
      badge: c.badge,
      description: c.description,
      backgroundUrl: c.background_url,
      live: status.live,
      title: status.title ?? null,
      viewerCount: status.viewerCount ?? null,
      gameName: status.gameName ?? null,
      startedAt: status.startedAt ?? null,
    };
  });

  const filtered = includeOffline ? enriched : enriched.filter((c) => c.live);
  const liveCount = enriched.filter((c) => c.live).length;

  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');
  return res.status(200).json({
    channels: filtered,
    total: enriched.length,
    liveCount,
  });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 60, key: 'bot-twitch-live' },
});
