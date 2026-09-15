// pages/api/player/predictions/[matchId].ts
//
// Le pronostic d'une joueuse sur UN match de tournoi.
//   GET    → état : ouvert/verrouillé, son pronostic, la récompense, et la
//            répartition une fois le match verrouillé ;
//   PUT    → pronostiquer ou changer d'avis tant que c'est ouvert ;
//   DELETE → retirer son pronostic tant que c'est ouvert.
//
// GRATUIT, ET C'EST CE QUI EN FAIT UN PRONOSTIC ET PAS UN PARI : aucune pièce
// n'est engagée. Un pronostic juste rapporte `MATCH_PREDICTION_COINS` au
// règlement (`utils/predictions/settle.ts`).
//
// LE REFUS EST DOUBLÉ. Cette route refuse un match verrouillé, une équipe hors
// match, une joueuse d'un des rosters et le staff, avec un code lisible ; le
// déclencheur `match_predictions_guard` refuse les deux premiers DANS la
// transaction d'écriture, ce qui ferme la fenêtre entre la lecture du match et
// l'écriture. Ses messages (`prediction_locked`…) sont traduits ici en codes.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { logger } from '@/utils/logger';
import { predictionBodySchema } from '@/lib/apiContracts/player/predictions/body';
import { readPredictionExclusions } from '@/utils/predictions/eligibility';
import { predictionWindow } from '@/utils/predictions/rules';
import {
  readMatchForPrediction,
  readMatchPredictionState,
} from '@/utils/predictions/readState';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Messages levés par le déclencheur → codes rendus à l'interface. */
const TRIGGER_CODES: ReadonlyArray<[string, string]> = [
  ['prediction_locked', 'locked'],
  ['prediction_not_open', 'not_predictable'],
  ['prediction_team_invalid', 'invalid_team'],
];

function triggerCode(message: string | undefined): string | null {
  if (!message) return null;
  for (const [needle, code] of TRIGGER_CODES) {
    if (message.includes(needle)) return code;
  }
  return null;
}

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }
  const method = req.method ?? 'GET';
  if (!['GET', 'PUT', 'DELETE'].includes(method)) {
    res.setHeader('Allow', 'GET, PUT, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (method !== 'GET') {
    if (
      applyRateLimit(
        req,
        res,
        { max: 30, windowMs: 60_000 },
        'player-predictions-write'
      )
    ) {
      return;
    }
  }

  const matchId =
    typeof req.query.matchId === 'string' ? req.query.matchId : '';
  if (!UUID_RE.test(matchId)) {
    return res
      .status(400)
      .json({ error: 'Match invalide.', code: 'invalid_match' });
  }

  const tenantId = resolveTenantIdForUserRequest(req);
  const now = new Date();

  const matchRead = await readMatchForPrediction(tenantId, matchId);
  if (!matchRead.ok) {
    logger.error('[predictions] match illisible: %s', matchRead.error);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  const match = matchRead.value;
  if (!match) {
    return res.status(404).json({ error: 'Match introuvable.' });
  }

  const exclusions = await readPredictionExclusions(match, [user.id]);
  if (!exclusions.ok) {
    logger.error('[predictions] exclusions illisibles: %s', exclusions.error);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  const ineligibility = exclusions.value.get(user.id) ?? null;

  if (method === 'GET') {
    const state = await readMatchPredictionState({
      match,
      userId: user.id,
      ineligibility,
      now,
    });
    if (!state.ok) {
      logger.error('[predictions] état illisible: %s', state.error);
      return res.status(500).json({ error: 'Lecture impossible.' });
    }
    return res.status(200).json(state.value);
  }

  const window = predictionWindow(match, now);
  if (window !== 'open') {
    return res.status(409).json({
      error: 'Les pronostics sont fermés pour ce match.',
      code: window === 'locked' ? 'locked' : 'not_predictable',
    });
  }
  if (ineligibility) {
    return res.status(403).json({
      error: 'Tu ne peux pas pronostiquer ce match.',
      code: ineligibility,
    });
  }

  if (method === 'DELETE') {
    const { error } = await supabaseAdmin
      .from('match_predictions')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('match_id', matchId)
      .eq('user_id', user.id)
      .is('settled_at', null);
    if (error) {
      logger.error('[predictions] retrait impossible: %s', error.message);
      return res.status(500).json({ error: 'Retrait impossible.' });
    }
    return res.status(200).json({ ok: true });
  }

  const parsed = predictionBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Équipe manquante.', code: 'invalid_team' });
  }
  const { teamId } = parsed.data;
  if (teamId !== match.team1_id && teamId !== match.team2_id) {
    return res.status(400).json({
      error: 'Cette équipe ne joue pas ce match.',
      code: 'invalid_team',
    });
  }

  const { data, error } = await supabaseAdmin
    .from('match_predictions')
    .upsert(
      {
        tenant_id: tenantId,
        match_id: matchId,
        user_id: user.id,
        predicted_winner_team_id: teamId,
      },
      { onConflict: 'tenant_id,match_id,user_id' }
    )
    .select('predicted_winner_team_id, result, updated_at')
    .maybeSingle();
  if (error) {
    const code = triggerCode(error.message);
    if (code) {
      return res.status(code === 'invalid_team' ? 400 : 409).json({
        error: 'Les pronostics sont fermés pour ce match.',
        code,
      });
    }
    logger.error('[predictions] écriture impossible: %s', error.message);
    return res.status(500).json({ error: 'Pronostic impossible.' });
  }

  const row = data as {
    predicted_winner_team_id: string;
    result: 'won' | 'lost' | 'void' | null;
    updated_at: string;
  } | null;
  return res.status(200).json({
    prediction: {
      teamId: row?.predicted_winner_team_id ?? teamId,
      result: row?.result ?? null,
      updatedAt: row?.updated_at ?? now.toISOString(),
    },
  });
});
