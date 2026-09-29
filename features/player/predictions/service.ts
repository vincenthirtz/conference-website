// features/player/predictions/service.ts — pronostics de la joueuse
// (lot P12). Extrait tel quel des routes historiques : mêmes refus, mêmes
// codes, même ordre de contrôle.
//
// GRATUIT, ET C'EST CE QUI EN FAIT UN PRONOSTIC ET PAS UN PARI : aucune pièce
// n'est engagée. Un pronostic juste rapporte `MATCH_PREDICTION_COINS` au
// règlement (`utils/predictions/settle.ts`).
//
// LE REFUS EST DOUBLÉ. Le service refuse un match verrouillé, une équipe hors
// match, une joueuse d'un des rosters et le staff, avec un code lisible ; le
// déclencheur `match_predictions_guard` refuse les deux premiers DANS la
// transaction d'écriture. Ses messages (`prediction_locked`…) sont traduits
// ici en codes.
//
// ON COMPTE TOUT LE MONDE, ON NE NOMME QUE SUR ACCORD (classement) : le rang
// se calcule sur tous les pronostics réglés, le nom n'apparaît que si la
// personne l'a accepté.

import type { AdminDb } from '@/utils/admin/serviceContext';
import { LegacyAdminError } from '@/utils/admin/errors';
import { PlayerError, parseBody } from '@/utils/player/errors';
import type { Logger } from '@/utils/logger';
import { isValidUUID } from '@/utils/apiHelpers';
import { readPredictionExclusions } from '@/utils/predictions/eligibility';
import { predictionWindow } from '@/utils/predictions/rules';
import {
  readMatchForPrediction,
  readMatchPredictionState,
  readPlayerPredictions,
} from '@/utils/predictions/readState';
import {
  readPredictionLeaderboard,
  setLeaderboardVisibility,
} from '@/utils/predictions/readLeaderboard';
import * as repo from './repository';
import {
  LeaderboardVisibilityBody,
  PredictionBody,
  type PredictionSaved,
} from './schemas';

export type PredictionsCtx = {
  db: AdminDb;
  tenantId: string;
  logger: Logger;
  /** La joueuse elle-même (routes `subject: 'self'`). */
  userId: string;
};

const readFailed = () =>
  new PlayerError(500, 'internal', 'Lecture impossible.');

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

/* ---------------------------- Liste ---------------------------------- */

/**
 * Les matchs à pronostiquer et les derniers pronostics. LA LISTE AFFICHE,
 * ELLE NE DÉCIDE PAS : l'autorité reste l'écriture et le déclencheur.
 */
export async function listPredictions(ctx: PredictionsCtx, isStaff: boolean) {
  const read = await readPlayerPredictions({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    isStaff,
    now: new Date(),
  });
  if (!read.ok) {
    ctx.logger.error('[predictions] liste illisible: %s', read.error);
    throw readFailed();
  }
  return read.value;
}

/* --------------------------- Classement ------------------------------ */

export async function getLeaderboard(
  ctx: PredictionsCtx,
  rawTournamentId: unknown
) {
  const tournamentId =
    typeof rawTournamentId === 'string' && isValidUUID(rawTournamentId)
      ? rawTournamentId
      : null;
  const read = await readPredictionLeaderboard({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    tournamentId,
  });
  if (!read.ok) {
    ctx.logger.error('[predictions] classement illisible: %s', read.error);
    throw readFailed();
  }
  return read.value;
}

export async function setVisibility(ctx: PredictionsCtx, rawBody: unknown) {
  const parsed = parseBody(LeaderboardVisibilityBody, rawBody, {
    message: 'Choix invalide.',
    code: 'invalid_choice',
  });
  if (!parsed.ok) {
    throw new LegacyAdminError(400, parsed.body.error, {
      code: parsed.body.code,
      extra: { fields: parsed.body.fields },
    });
  }
  const show = parsed.data.showInLeaderboard;
  const saved = await setLeaderboardVisibility({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    show,
  });
  if (!saved.ok) {
    ctx.logger.error(
      '[predictions] préférence non enregistrée: %s',
      saved.error
    );
    throw new PlayerError(500, 'internal', 'Enregistrement impossible.');
  }
  return { showsMyName: show };
}

/* ------------------------ Pronostic d'un match ----------------------- */

/** Match du tenant + inéligibilité de la joueuse (communs aux 3 méthodes). */
async function loadMatch(ctx: PredictionsCtx, rawMatchId: unknown) {
  const matchId = typeof rawMatchId === 'string' ? rawMatchId : '';
  if (!isValidUUID(matchId)) {
    throw new LegacyAdminError(400, 'Match invalide.', {
      code: 'invalid_match',
    });
  }
  const matchRead = await readMatchForPrediction(ctx.tenantId, matchId);
  if (!matchRead.ok) {
    ctx.logger.error('[predictions] match illisible: %s', matchRead.error);
    throw readFailed();
  }
  const match = matchRead.value;
  if (!match) throw new PlayerError(404, 'not_found', 'Match introuvable.');

  const exclusions = await readPredictionExclusions(match, [ctx.userId]);
  if (!exclusions.ok) {
    ctx.logger.error(
      '[predictions] exclusions illisibles: %s',
      exclusions.error
    );
    throw readFailed();
  }
  return {
    matchId,
    match,
    ineligibility: exclusions.value.get(ctx.userId) ?? null,
  };
}

type Loaded = Awaited<ReturnType<typeof loadMatch>>;

export async function getMatchPrediction(
  ctx: PredictionsCtx,
  rawMatchId: unknown
) {
  const { match, ineligibility } = await loadMatch(ctx, rawMatchId);
  const state = await readMatchPredictionState({
    match,
    userId: ctx.userId,
    ineligibility,
    now: new Date(),
  });
  if (!state.ok) {
    ctx.logger.error('[predictions] état illisible: %s', state.error);
    throw readFailed();
  }
  return state.value;
}

/** Fenêtre ouverte et joueuse éligible, sinon refus (409 / 403). */
function assertWritable({ match, ineligibility }: Loaded, now: Date) {
  const window = predictionWindow(match, now);
  if (window !== 'open') {
    throw new LegacyAdminError(
      409,
      'Les pronostics sont fermés pour ce match.',
      { code: window === 'locked' ? 'locked' : 'not_predictable' }
    );
  }
  if (ineligibility) {
    throw new LegacyAdminError(403, 'Tu ne peux pas pronostiquer ce match.', {
      code: ineligibility,
    });
  }
}

export async function deleteMatchPrediction(
  ctx: PredictionsCtx,
  rawMatchId: unknown
) {
  const loaded = await loadMatch(ctx, rawMatchId);
  assertWritable(loaded, new Date());
  const { error } = await repo.deleteOpenPrediction(ctx.db, {
    tenantId: ctx.tenantId,
    matchId: loaded.matchId,
    userId: ctx.userId,
  });
  if (error) {
    ctx.logger.error('[predictions] retrait impossible: %s', error.message);
    throw new PlayerError(500, 'internal', 'Retrait impossible.');
  }
  return { ok: true };
}

export async function putMatchPrediction(
  ctx: PredictionsCtx,
  rawMatchId: unknown,
  rawBody: unknown
): Promise<PredictionSaved> {
  const now = new Date();
  const loaded = await loadMatch(ctx, rawMatchId);
  assertWritable(loaded, now);
  const { match, matchId } = loaded;

  const parsed = PredictionBody.safeParse(rawBody ?? {});
  if (!parsed.success) {
    throw new LegacyAdminError(400, 'Équipe manquante.', {
      code: 'invalid_team',
    });
  }
  const { teamId } = parsed.data;
  if (teamId !== match.team1_id && teamId !== match.team2_id) {
    throw new LegacyAdminError(400, 'Cette équipe ne joue pas ce match.', {
      code: 'invalid_team',
    });
  }

  const { row, error } = await repo.upsertPrediction(ctx.db, {
    tenantId: ctx.tenantId,
    matchId,
    userId: ctx.userId,
    teamId,
  });
  if (error) {
    const code = triggerCode(error.message);
    if (code) {
      throw new LegacyAdminError(
        code === 'invalid_team' ? 400 : 409,
        'Les pronostics sont fermés pour ce match.',
        { code }
      );
    }
    ctx.logger.error('[predictions] écriture impossible: %s', error.message);
    throw new PlayerError(500, 'internal', 'Pronostic impossible.');
  }
  return {
    prediction: {
      teamId: row?.predicted_winner_team_id ?? teamId,
      result: row?.result ?? null,
      updatedAt: row?.updated_at ?? now.toISOString(),
    },
  };
}
