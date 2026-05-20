// POST /api/bot/v1/stages/[stageId]/next-round
//
// Commande /next-round (admin) : genere le round Swiss suivant pour une
// phase. Delegue la logique a utils/swiss/runNextRound.ts.
//
// Body :
//   actorDiscordUserId (staff admin/owner)
//   dryRun?            (defaut false) — preview sans insert
//   acceptRematches?   (defaut false) — required si pairing produit
//                                       des rematches
//   roundNumber?       (defaut max + 1)
//   allowRematchesFallback? (defaut true)
//   scoreConfig?       (defaut win=1, draw=0.5, loss=0, bye=1)
//
// Reponses notables :
//   200 + mode='dry-run' : preview retourne, rien insere
//   201 + mode='inserted' : matchs crees
//   409 code='REMATCHES_PRESENT' : pairing implique des rematches, preview
//                                   inclus pour confirmation
//   400 code='USE_ADMIN_UI' : la phase utilise des seuils win/loss
//                              (out-of-scope bot — utilise l'admin UI)
//
// Auth : x-api-key + actorDiscordUserId staff admin/owner.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import { runSwissNextRound } from '@/utils/swiss/runNextRound';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.stageId;
  const stageId = Array.isArray(raw) ? raw[0] : raw;
  if (!stageId || !isValidUUID(stageId)) {
    return res.status(400).json({ error: 'stageId invalide' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const actor = await requireBotStaff(req, res, body);
  if (!actor) return;

  const result = await runSwissNextRound({
    tenantId: req.botContext!.tenantId,
    stageId,
    roundNumber:
      typeof body.roundNumber === 'number' &&
      Number.isInteger(body.roundNumber)
        ? body.roundNumber
        : undefined,
    scoreConfig:
      body.scoreConfig && typeof body.scoreConfig === 'object'
        ? (body.scoreConfig as Record<string, number>)
        : undefined,
    acceptRematches: body.acceptRematches === true,
    dryRun: body.dryRun === true,
    allowRematchesFallback:
      body.allowRematchesFallback === undefined
        ? undefined
        : body.allowRematchesFallback === true,
  });

  if (!result.ok) {
    return res.status(result.status).json({
      error: result.error,
      code: result.code,
      ...(result.preview ? { preview: result.preview } : {}),
      ...(typeof result.hasRematches === 'boolean'
        ? { hasRematches: result.hasRematches }
        : {}),
      ...(typeof result.roundNumber === 'number'
        ? { roundNumber: result.roundNumber }
        : {}),
    });
  }

  // Audit log uniquement sur insert reel.
  if (result.mode === 'inserted') {
    await logBotStaffAction({
      staffId: actor.staffId,
      action: 'create_swiss_round',
      entity_type: 'stage',
      entity_id: result.stageId,
      tournament_id: result.tournamentId,
      payload: {
        round_number: result.roundNumber,
        has_rematches: result.hasRematches,
        match_count: result.createdMatchIds.length,
      },
    });
  }

  return res.status(result.mode === 'inserted' ? 201 : 200).json({
    success: true,
    mode: result.mode,
    stageId: result.stageId,
    tournamentId: result.tournamentId,
    roundNumber: result.roundNumber,
    hasRematches: result.hasRematches,
    preview: result.preview,
    createdMatchIds: result.createdMatchIds,
  });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: {
    max: 10,
    key: 'bot-stage-next-round',
    perActor: { max: 5, windowMs: 60_000 },
  },
  idempotent: true,
});
