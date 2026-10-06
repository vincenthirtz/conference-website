// features/player/matches/service/evidence.ts — une capitaine (ou manager
// d'équipe) joint une capture d'écran à son match depuis le site ; pendant WEB
// de POST /api/bot/v1/matches/{matchId}/evidence (kind `screenshot`).
//
// Même droit que la déclaration du score (utils/matches/reportRight.ts) : on
// dépose une preuve pour SON côté, une personne qui tient les deux équipes est
// refusée (REPORT_BOTH_SIDES) — une preuve porte un `team_side`.
// Décodage, magic bytes, sha256, upload dans le bucket privé `match-evidence`
// et insertion : storeSideEvidence (utils/matches/evidence.ts), partagé avec
// la route bot.

import * as z from 'zod';
import { LegacyAdminError } from '@/utils/admin/errors';
import { storeSideEvidence } from '@/utils/matches/evidence';
import * as repo from '../repository';
import {
  type EvidenceUploadInput,
  type EvidenceUploadResult,
  PLAYER_EVIDENCE_MAX_BYTES,
} from '../schemas';
import type { MatchesCtx } from './context';
import {
  decideReportingSide,
  loadReportableTeamIds,
  REPORT_BOTH_SIDES,
  ReportRightLookupError,
} from './reportRight';

const MatchIdQuery = z.object({ matchId: z.string().uuid() });

type TeamRel = { id: string; name: string; captain_id: string | null };

const fail = (status: number, error: string, code: string) =>
  new LegacyAdminError(status, error, { code });

function unwrap<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function attachScreenshot(
  ctx: MatchesCtx,
  rawQuery: unknown,
  body: EvidenceUploadInput
): Promise<EvidenceUploadResult> {
  const { db, tenantId, userId, logger } = ctx;

  const parsed = MatchIdQuery.safeParse(rawQuery);
  if (!parsed.success) {
    throw fail(400, 'Identifiant de match invalide.', 'INVALID_MATCH_ID');
  }
  const { matchId } = parsed.data;

  const { match, error } = await repo.readMatchForReport(db, tenantId, matchId);
  if (error) {
    logger.error('[player/evidence] match lookup error', error);
    throw fail(500, 'Erreur de lecture du match.', 'MATCH_LOOKUP_FAILED');
  }
  if (!match) throw fail(404, 'Match introuvable.', 'MATCH_NOT_FOUND');

  const team1 = unwrap(match.team1 as TeamRel | TeamRel[] | null);
  const team2 = unwrap(match.team2 as TeamRel | TeamRel[] | null);
  if (!team1?.id || !team2?.id) {
    throw fail(
      400,
      'Match incomplet (équipes non assignées).',
      'MATCH_INCOMPLETE'
    );
  }

  let reportable: Set<string>;
  try {
    reportable = await loadReportableTeamIds(db, tenantId, userId, [
      team1,
      team2,
    ]);
  } catch (e) {
    if (!(e instanceof ReportRightLookupError)) throw e;
    logger.error('[player/evidence] report right lookup error', e.cause);
    throw fail(
      500,
      'Erreur de vérification des droits.',
      'REPORT_RIGHT_LOOKUP_FAILED'
    );
  }
  const decision = decideReportingSide(reportable, team1.id, team2.id);
  if (decision.side === null) {
    if (decision.code === REPORT_BOTH_SIDES) {
      throw fail(
        403,
        'Vous êtes capitaine ou manager des deux équipes de ce match : chaque équipe joint ses preuves séparément.',
        REPORT_BOTH_SIDES
      );
    }
    throw fail(
      403,
      "Vous n'êtes ni capitaine ni manager d'une des deux équipes de ce match.",
      'NOT_REPORTER'
    );
  }

  const stored = await storeSideEvidence({
    tenantId,
    matchId,
    side: decision.side,
    authUserId: userId,
    discordUserId: null,
    input: {
      kind: 'screenshot',
      file_base64: body.file_base64,
      // Le nom ne décide de rien pour une capture (type lu sur les octets).
      filename: body.filename ?? 'capture',
      note: body.note || null,
    },
    maxBytes: PLAYER_EVIDENCE_MAX_BYTES,
  });
  if (!stored.ok) {
    if (stored.cause)
      logger.error('[player/evidence] store error', stored.cause);
    throw fail(stored.status, stored.error, stored.code);
  }

  logger.info('[player/evidence] screenshot attached', {
    matchId,
    side: decision.side,
    evidenceId: stored.id,
    authUserId: userId,
  });
  return { id: stored.id, kind: 'screenshot' };
}
