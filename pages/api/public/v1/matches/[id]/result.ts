// POST /api/public/v1/matches/{id}/result
//
// Écriture publique PILOTE (feature "API publique élargie" — Lot 3). Permet à
// une orga tierce, avec un token API scopé `matches:write`, de POSER
// directement le score final d'un match. Contrairement au flow bot capitaine
// (double report + consensus), un token API EST une autorité : on applique le
// score sans attendre de contre-report — même chemin métier que l'admin.
//
// Auth : `Authorization: Bearer pk_live_…` (scope `matches:write`) via
// `withPublicWrite`. Idempotent (Idempotency-Key honoré). Tenant résolu par le
// token (autoritaire).
//
// Réutilise `applyMatchScore()` — la fonction cœur partagée avec l'admin et le
// bot (status='finished', propagation bracket, notifications Discord).

import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  withPublicWrite,
  PublicWriteError,
  type PublicWriteContext,
} from '@/utils/publicWriteApi';
import { scoreSchema, uuidSchema } from '@/utils/botValidation';
import { applyMatchScore } from '@/utils/matches/applyScore';
import { logger } from '@/utils/logger';

const bodySchema = z.object({
  team1Score: scoreSchema,
  team2Score: scoreSchema,
});
const querySchema = z.object({ id: uuidSchema });

type Body = z.infer<typeof bodySchema>;
type Query = z.infer<typeof querySchema>;

const TERMINAL_STATUSES = new Set(['finished', 'walkover', 'cancelled']);

async function handler(
  _req: NextApiRequest,
  res: NextApiResponse,
  ctx: PublicWriteContext<Body, Query>
) {
  const { id: matchId } = ctx.query;
  const { team1Score, team2Score } = ctx.input;
  const tenantId = ctx.token.tenantId;

  // Le match doit exister dans le tenant du token (defense-in-depth) et ne pas
  // être déjà clôturé (on ne réécrit pas un résultat finalisé via l'API — le
  // staff le fait depuis l'admin).
  const { data: match, error: matchErr } = await supabaseAdmin!
    .from('matches')
    .select('id, status, is_bye, team1_id, team2_id')
    .eq('tenant_id', tenantId)
    .eq('id', matchId)
    .maybeSingle();

  if (matchErr) {
    logger.error('[public/v1/matches/result] match lookup error', matchErr);
    throw new PublicWriteError(500, 'Erreur de lecture du match', 'INTERNAL');
  }
  if (!match) throw PublicWriteError.notFound('Match introuvable');
  if (match.is_bye) {
    throw PublicWriteError.badRequest('Match marqué bye — score inapplicable');
  }
  if (!match.team1_id || !match.team2_id) {
    throw PublicWriteError.badRequest(
      'Match incomplet (équipes non assignées)'
    );
  }
  if (TERMINAL_STATUSES.has(match.status)) {
    throw PublicWriteError.conflict(
      `Match déjà clôturé (status=${match.status}). Contactez le staff pour modifier.`
    );
  }

  try {
    const result = await applyMatchScore({
      tenantId,
      matchId,
      team1Score,
      team2Score,
      markFinished: true,
      staffId: null,
      propagateBracket: true,
    });

    return res.status(200).json({
      data: {
        matchId,
        status: 'finished',
        team1Score,
        team2Score,
        winnerTeamId: result.winnerTeamId,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('[public/v1/matches/result] applyMatchScore error', e);
    throw new PublicWriteError(
      500,
      `Échec de la finalisation : ${msg}`,
      'INTERNAL'
    );
  }
}

export default withPublicWrite<Body, Query>(handler, {
  methods: ['POST'],
  scope: 'matches:write',
  rateLimit: { max: 30, key: 'public-v1-match-result', perTokenMax: 15 },
  idempotent: true,
  bodySchema,
  querySchema,
});
