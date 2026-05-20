// POST /api/bot/v1/tournaments/[tournamentId]/status
//
// Commande /publier-tournoi (admin) : passe un tournoi entre les status
// 'draft' et 'published'. On ne propose volontairement pas les transitions
// 'running' / 'completed' / 'archived' depuis le bot : ces transitions
// engagent des effets metier lourds (notifications, propagation, freeze
// roster) et restent reservees au workflow admin UI.
//
// Garde-fou aligne sur status-guards.ts : 'published' exige >= 1 stage.
//
// Auth : x-api-key + actorDiscordUserId staff admin/owner.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const ALLOWED_STATUSES = new Set(['draft', 'published']);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.tournamentId;
  const tournamentId = Array.isArray(raw) ? raw[0] : raw;
  if (!tournamentId || !isValidUUID(tournamentId)) {
    return res.status(400).json({ error: 'tournamentId invalide' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const actor = await requireBotStaff(req, res, body);
  if (!actor) return;

  const status =
    typeof body.status === 'string' ? body.status.trim().toLowerCase() : '';
  if (!ALLOWED_STATUSES.has(status)) {
    return res.status(400).json({
      error: `status requis ('draft' ou 'published').`,
    });
  }

  const { data: tournament, error: tErr } = await supabaseAdmin
    .from('tournaments')
    .select('id, name, status')
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('id', tournamentId)
    .maybeSingle();
  if (tErr) {
    logger.error('[bot/tournament/status] lookup error', tErr);
    return res.status(500).json({ error: 'Erreur de chargement du tournoi' });
  }
  if (!tournament) {
    return res.status(404).json({ error: 'Tournoi introuvable' });
  }
  if (tournament.status === status) {
    return res
      .status(409)
      .json({ error: `Le tournoi est déjà en status "${status}".` });
  }

  // Garde 'published' : au moins 1 phase, sinon publier n'a aucun sens.
  if (status === 'published') {
    const { count, error: cntErr } = await supabaseAdmin
      .from('tournament_stages')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', req.botContext!.tenantId)
      .eq('tournament_id', tournamentId);
    if (cntErr) {
      logger.error('[bot/tournament/status] stages count error', cntErr);
      return res.status(500).json({ error: 'Erreur de vérification phases' });
    }
    if ((count ?? 0) === 0) {
      return res.status(400).json({
        error: 'Le tournoi doit avoir au moins 1 phase pour être publié.',
      });
    }
  }

  // Refuse de redescendre vers 'draft' depuis 'running'/'completed' — cela
  // signifierait re-cacher un tournoi en cours d'execution. C'est aligne sur
  // l'esprit de status-guards.ts ('draft' est officiellement always-allowed
  // dans l'UI mais reserve aux managers ; cote bot on reste strict).
  if (
    status === 'draft' &&
    (tournament.status === 'running' || tournament.status === 'completed')
  ) {
    return res.status(400).json({
      error: `Impossible de repasser en "draft" depuis "${tournament.status}". Passez par l'admin UI.`,
    });
  }

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('tournaments')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('id', tournamentId)
    .select('id, name, status')
    .maybeSingle();
  if (updErr || !updated) {
    logger.error('[bot/tournament/status] update error', updErr);
    return res.status(500).json({ error: 'Échec de mise à jour du status' });
  }

  await logBotStaffAction({
    staffId: actor.staffId,
    action: 'update_tournament',
    entity_type: 'tournament',
    entity_id: tournamentId,
    tournament_id: tournamentId,
    payload: {
      action_type: 'status_change',
      from: tournament.status,
      to: status,
    },
  });

  return res.status(200).json({
    success: true,
    tournament: updated,
    previousStatus: tournament.status,
  });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: {
    max: 10,
    key: 'bot-tournament-status',
    perActor: { max: 5, windowMs: 60_000 },
  },
  idempotent: true,
});
