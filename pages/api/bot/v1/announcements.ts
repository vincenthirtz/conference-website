// POST /api/bot/v1/announcements
//
// Commande /annoncer (admin) : cree une annonce site-wide. Mirror du admin
// route admin/announcements (POST). Si l'annonce est active, le webhook
// Discord notifyAnnouncement est declenche en async (comme cote site).
//
// Body :
//   actorDiscordUserId (staff admin/owner)
//   title, message              (requis)
//   ctaLabel?, ctaUrl?          (optionnel)
//   startsAt?, endsAt?          (ISO 8601)
//   isActive?                   (defaut true)
//   priority?                   (defaut 0)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import { sanitizeUrl } from '@/utils/apiHelpers';
import { notifyAnnouncement } from '@/utils/discord';
import { logger } from '@/utils/logger';

const TITLE_MAX = 200;
const MESSAGE_MAX = 5000;

function toISO(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const actor = await requireBotStaff(req, res, body);
  if (!actor) return;

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return res.status(400).json({ error: 'title requis' });
  if (title.length > TITLE_MAX) {
    return res.status(400).json({ error: `title trop long (max ${TITLE_MAX})` });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return res.status(400).json({ error: 'message requis' });
  if (message.length > MESSAGE_MAX) {
    return res
      .status(400)
      .json({ error: `message trop long (max ${MESSAGE_MAX})` });
  }

  const ctaLabel =
    typeof body.ctaLabel === 'string' ? body.ctaLabel.trim() || null : null;
  const ctaUrl =
    typeof body.ctaUrl === 'string' ? sanitizeUrl(body.ctaUrl) : null;
  if (body.ctaUrl && !ctaUrl) {
    return res
      .status(400)
      .json({ error: 'ctaUrl invalide (http/https attendu)' });
  }

  const isActive = body.isActive !== false; // defaut true
  const priority =
    typeof body.priority === 'number' && Number.isFinite(body.priority)
      ? Math.trunc(body.priority)
      : 0;

  const startsAt = toISO(body.startsAt);
  const endsAt = toISO(body.endsAt);
  if (body.startsAt && !startsAt) {
    return res.status(400).json({ error: 'startsAt invalide (ISO 8601)' });
  }
  if (body.endsAt && !endsAt) {
    return res.status(400).json({ error: 'endsAt invalide (ISO 8601)' });
  }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('announcements')
    .insert({
      title,
      message,
      cta_label: ctaLabel,
      cta_url: ctaUrl,
      is_active: isActive,
      priority,
      starts_at: startsAt,
      ends_at: endsAt,
    })
    .select('*')
    .single();
  if (insErr || !inserted) {
    logger.error('[bot/announcements] insert error', insErr);
    return res.status(500).json({ error: 'Échec de la création' });
  }

  if (isActive) {
    void notifyAnnouncement({
      tournamentId: null,
      title,
      message,
      ctaLabel,
      ctaUrl,
    }).catch((e) => logger.error('[bot/announcements] discord notify error', e));
  }

  await logBotStaffAction({
    staffId: actor.staffId,
    action: 'other',
    entity_type: 'announcement',
    entity_id: inserted.id,
    payload: {
      action_type: 'create_announcement',
      title,
      is_active: isActive,
      priority,
    },
  });

  return res.status(201).json({ announcement: inserted });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 20, key: 'bot-announcements' },
  idempotent: true,
});
