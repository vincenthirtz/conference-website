// POST /api/bot/v1/cast/[assignmentId]/ack
//
// Le caster clique le bouton "Je confirme" du DM T-30 (provenant de
// /api/bot/v1/cast/upcoming). On marque cast_assignments.acked_at = now().
//
// Auth :
//   - x-api-key
//   - body.actorDiscordUserId : doit etre le caster lui-meme (resolu via
//     cast_members.auth_user_id + user_discord_links). Sinon 403.
//
// Idempotent : un 2eme appel reussit (200) sans changer acked_at. Le bouton
// DM peut donc etre clique plusieurs fois sans effet de bord.
//
// Erreurs :
//   - 400 : assignmentId invalide / actorDiscordUserId invalide
//   - 403 : actor n'est pas le caster de l'assignment
//   - 404 : assignment inconnu
//   - 503 : maintenance mode

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const DISCORD_ID_RE = /^[0-9]{15,25}$/;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const rawId = req.query.assignmentId;
  const assignmentId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!assignmentId || !isValidUUID(assignmentId)) {
    return res.status(400).json({ error: 'assignmentId invalide' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const actorDiscordUserId =
    typeof body.actorDiscordUserId === 'string' ? body.actorDiscordUserId.trim() : '';
  if (!DISCORD_ID_RE.test(actorDiscordUserId)) {
    return res.status(400).json({ error: 'actorDiscordUserId invalide' });
  }

  const { data: assignment, error: aErr } = await supabaseAdmin
    .from('cast_assignments')
    .select(
      `id, acked_at, cast_member_id,
       cast_member:cast_member_id (id, auth_user_id)`
    )
    .eq('id', assignmentId)
    .maybeSingle();
  if (aErr) {
    logger.error('[bot/cast/ack] lookup error', aErr);
    return res.status(500).json({ error: 'Erreur de lecture' });
  }
  if (!assignment) {
    return res.status(404).json({ error: 'Assignment introuvable' });
  }

  const cmRel = (assignment as Record<string, unknown>).cast_member;
  const cm = (Array.isArray(cmRel) ? cmRel[0] : cmRel) as
    | Record<string, unknown>
    | null
    | undefined;
  const casterAuthId =
    cm && typeof cm.auth_user_id === 'string' ? cm.auth_user_id : null;

  if (!casterAuthId) {
    // Caster pas lie a un compte auth -> impossible de matcher un Discord ID
    return res.status(403).json({
      error:
        "Ce caster n'est pas lie a un compte auth, l'ack via bot est indisponible.",
    });
  }

  const { data: link, error: lErr } = await supabaseAdmin
    .from('user_discord_links')
    .select('discord_user_id')
    .eq('auth_user_id', casterAuthId)
    .maybeSingle();
  if (lErr) {
    logger.error('[bot/cast/ack] link error', lErr);
    return res.status(500).json({ error: 'Erreur de verification caster' });
  }
  const casterDiscordId =
    link && typeof (link as { discord_user_id: unknown }).discord_user_id === 'string'
      ? (link as { discord_user_id: string }).discord_user_id
      : null;

  if (casterDiscordId !== actorDiscordUserId) {
    return res
      .status(403)
      .json({ error: "Tu n'es pas le caster de cette assignation." });
  }

  // Idempotent : si deja acked, on renvoie 200 sans rien faire.
  const existingAck = (assignment as { acked_at: string | null }).acked_at;
  if (existingAck) {
    return res.status(200).json({
      assignmentId,
      ackedAt: existingAck,
      alreadyAcked: true,
    });
  }

  const ackedAt = new Date().toISOString();
  const { error: uErr } = await supabaseAdmin
    .from('cast_assignments')
    .update({ acked_at: ackedAt })
    .eq('id', assignmentId);
  if (uErr) {
    logger.error('[bot/cast/ack] update error', uErr);
    return res.status(500).json({ error: 'Erreur de mise a jour' });
  }

  return res.status(200).json({
    assignmentId,
    ackedAt,
    alreadyAcked: false,
  });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 30, key: 'cast.ack' },
  idempotent: true,
});
