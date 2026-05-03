// pages/api/admin/site-settings/discord-test.ts
// POST: envoie un message de test sur le webhook *global* configure pour un
// channel_type donne. Equivalent de discord-test.ts mais sans tournament_id.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { postToDiscordWebhook } from '@/utils/discord';
import { isDiscordChannelType } from '@/utils/discord/channels';

export default withStaffRoute(handler, 'admin');

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { channelType } = req.body || {};
  if (!isDiscordChannelType(channelType)) {
    return res.status(400).json({ error: 'Invalid channelType' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable' });
  }

  const { data: cfg } = await supabaseAdmin
    .from('discord_webhooks')
    .select('webhook_url')
    .is('tournament_id', null)
    .eq('channel_type', channelType)
    .eq('is_active', true)
    .maybeSingle();

  if (!cfg?.webhook_url) {
    return res.status(404).json({
      error: `Aucun webhook global actif configure pour ${channelType}`,
    });
  }

  await postToDiscordWebhook(cfg.webhook_url, {
    username: "OW Women's Cup — Test",
    embeds: [
      {
        title: '🧪 Test webhook (global)',
        description: `Le webhook global \`${channelType}\` fonctionne correctement.`,
        color: 0x10b981,
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Configuration globale (fallback maitre)',
        },
      },
    ],
  });

  return res.status(200).json({ success: true });
}
