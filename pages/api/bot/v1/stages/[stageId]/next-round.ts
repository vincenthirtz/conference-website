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

import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import { discordIdSchema, uuidSchema } from '@/utils/botValidation';
import { runSwissNextRound } from '@/utils/swiss/runNextRound';

const nextRoundBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  roundNumber: z.number().int().optional(),
  scoreConfig: z.record(z.string(), z.number()).optional(),
  acceptRematches: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  // Tri-state préservé : absent → undefined (laisse le défaut interne), présent
  // → forcé à booléen. Lu via `=== true` dans le handler comme avant.
  allowRematchesFallback: z.boolean().optional(),
});
const nextRoundQuerySchema = z.object({ stageId: uuidSchema });

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { stageId } = req.botQuery as z.infer<typeof nextRoundQuerySchema>;

  const actor = await requireBotStaff(req, res, req.body ?? {});
  if (!actor) return;

  const input = req.botInput as z.infer<typeof nextRoundBodySchema>;

  const result = await runSwissNextRound({
    tenantId: req.botContext!.tenantId,
    stageId,
    roundNumber: input.roundNumber,
    scoreConfig: input.scoreConfig,
    acceptRematches: input.acceptRematches === true,
    dryRun: input.dryRun === true,
    allowRematchesFallback:
      input.allowRematchesFallback === undefined
        ? undefined
        : input.allowRematchesFallback === true,
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
  bodySchema: nextRoundBodySchema,
  querySchema: nextRoundQuerySchema,
});
