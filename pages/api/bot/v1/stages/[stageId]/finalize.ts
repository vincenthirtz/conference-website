// POST /api/bot/v1/stages/[stageId]/finalize
//
// Commande /finaliser-phase (admin) : ferme une phase. Action minimale :
// passe tournament_stages.is_active=false. La phase devient en lecture
// seule pour les commandes bot qui filtrent sur is_active.
//
// Garde par defaut : refuse si la phase a des matchs encore actifs
// (pending / ongoing / disputed). Override via body.force=true.
//
// Volontairement v1 minimale :
//   - PAS d'auto-promote vers la phase suivante (le bracket propagation
//     existant tryAutoAdvanceFromMatch s'en charge a la finalisation
//     de chaque match)
//   - PAS de calcul + persistance des standings finales (deja calcules
//     a la volee par /tournaments/[id]/bracket)
//
// Body :
//   actorDiscordUserId (staff admin/owner)
//   force?             (defaut false) — bypass le garde matchs actifs

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const ACTIVE_STATUSES = new Set(['pending', 'ongoing', 'disputed']);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.stageId;
  const stageId = Array.isArray(raw) ? raw[0] : raw;
  if (!stageId || !isValidUUID(stageId)) {
    return res.status(400).json({ error: 'stageId invalide' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const actor = await requireBotStaff(req, res, body);
  if (!actor) return;

  const force = body.force === true;

  const { data: stage, error: stErr } = await supabaseAdmin
    .from('tournament_stages')
    .select('id, tournament_id, name, is_active')
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('id', stageId)
    .maybeSingle();
  if (stErr) {
    logger.error('[bot/finalize] stage lookup error', stErr);
    return res.status(500).json({ error: 'Erreur de chargement du stage' });
  }
  if (!stage) {
    return res.status(404).json({ error: 'Stage introuvable' });
  }

  if (stage.is_active === false) {
    return res
      .status(409)
      .json({ error: 'La phase est deja inactive.', code: 'ALREADY_INACTIVE' });
  }

  // Verifie qu'aucun match n'est encore actif.
  const { data: activeMatches, error: amErr } = await supabaseAdmin
    .from('matches')
    .select('id, status, round_number')
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('stage_id', stageId)
    .in('status', [...ACTIVE_STATUSES]);
  if (amErr) {
    logger.error('[bot/finalize] active matches error', amErr);
    return res
      .status(500)
      .json({ error: 'Erreur de verification des matchs actifs' });
  }
  const active = (activeMatches ?? []) as Array<{
    id: string;
    status: string;
    round_number: number | null;
  }>;

  if (active.length > 0 && !force) {
    return res.status(409).json({
      error: `${active.length} match(s) encore actif(s) (status: ${[...new Set(active.map((m) => m.status))].join(', ')}). Termine-les ou utilise force=true.`,
      code: 'ACTIVE_MATCHES_PRESENT',
      activeMatchCount: active.length,
      sampleMatchIds: active.slice(0, 5).map((m) => m.id),
    });
  }

  const { data: updated, error: upErr } = await supabaseAdmin
    .from('tournament_stages')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('id', stageId)
    .select('id, name, is_active')
    .maybeSingle();
  if (upErr || !updated) {
    logger.error('[bot/finalize] update error', upErr);
    return res
      .status(500)
      .json({ error: 'Echec de la finalisation de la phase' });
  }

  await logBotStaffAction({
    staffId: actor.staffId,
    action: 'update_stage',
    entity_type: 'stage',
    entity_id: stageId,
    tournament_id: stage.tournament_id ?? null,
    payload: {
      action_type: 'finalize',
      forced: force,
      active_matches_at_finalize: active.length,
    },
  });

  return res.status(200).json({
    success: true,
    stage: updated,
    forced: force,
    activeMatchesAtFinalize: active.length,
  });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: {
    max: 10,
    key: 'bot-stage-finalize',
    perActor: { max: 5, windowMs: 60_000 },
  },
  idempotent: true,
});
