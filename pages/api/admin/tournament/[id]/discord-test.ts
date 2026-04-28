// pages/api/admin/tournament/[id]/discord-test.ts
// POST: send a test message to a configured webhook to verify it works.
// Body: { channelType: string }

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import { postToDiscordWebhook } from '@/utils/discord';

const VALID_CHANNEL_TYPES = [
  'match_announcements',
  'match_results',
  'bracket_updates',
  'general_announcements',
  'veto_live',
  'checkin_reminders',
  'support_tickets',
  'mvp_polls',
] as const;

export default withStaffRoute(handler, 'admin');

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tournament ID' });
  }

  const { channelType } = req.body || {};
  if (
    typeof channelType !== 'string' ||
    !(VALID_CHANNEL_TYPES as readonly string[]).includes(channelType)
  ) {
    return res.status(400).json({ error: 'Invalid channelType' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable' });
  }

  // Lookup webhook (tournament-scoped first, then global fallback)
  const { data: scoped } = await supabaseAdmin
    .from('discord_webhooks')
    .select('webhook_url, role_mention, tournament_id')
    .eq('tournament_id', id)
    .eq('channel_type', channelType)
    .eq('is_active', true)
    .maybeSingle();

  let cfg = scoped;
  if (!cfg) {
    const { data: global } = await supabaseAdmin
      .from('discord_webhooks')
      .select('webhook_url, role_mention, tournament_id')
      .is('tournament_id', null)
      .eq('channel_type', channelType)
      .eq('is_active', true)
      .maybeSingle();
    cfg = global;
  }

  if (!cfg?.webhook_url) {
    return res
      .status(404)
      .json({ error: `No active webhook configured for ${channelType}` });
  }

  await postToDiscordWebhook(cfg.webhook_url, {
    username: "OW Women's Cup — Test",
    embeds: [
      {
        title: '🧪 Test webhook',
        description: `Le webhook \`${channelType}\` fonctionne correctement.`,
        color: 0x10b981,
        timestamp: new Date().toISOString(),
        footer: {
          text: cfg.tournament_id
            ? 'Configuration spécifique au tournoi'
            : 'Configuration globale (fallback)',
        },
      },
    ],
  });

  return res.status(200).json({ success: true });
}
