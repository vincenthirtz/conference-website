// features/player/network/service/scouting.ts — dossier d'adversaire (N5)
// (lot P15). Extrait tel quel de la route historique.
//
// LA LIGNE DE CONFIDENTIALITÉ, qui décide de tout le reste :
//   - de l'ADVERSAIRE, seulement des RÉSULTATS publics et connus des deux
//     camps — jamais ses revues (N2), son rythme déclaré (N1) ni son roster
//     interne. Ses « créneaux habituels » sont dérivés des heures RÉELLEMENT
//     jouées, pas d'une disponibilité déclarée ;
//   - de MOI, ce qui est privé peut figurer, puisque c'est le mien : les
//     revues de mon équipe sur cet adversaire sont jointes au dossier.
// Rating et fiabilité sont ceux de l'annuaire (R4/R10), déjà exposés.

import { LegacyAdminError } from '@/utils/admin/errors';
import { findMemberTeam } from '@/utils/teams/memberTeam';
import { loadPlayedGames } from '@/utils/teams/playedGames';
import { buildScoutingReport } from '@/utils/teams/scouting';
import {
  EMPTY_RELIABILITY,
  loadTeamReliability,
} from '@/utils/teams/reliability';
import { loadMyRhythmTimezone } from '@/utils/teams/teamRhythmStore';
import { getTimeZoneOffsetMinutes } from '@/utils/timezone';
import * as repo from '../repository';
import type { ScoutingResponse } from '../schemas';
import type { NetworkCtx } from './context';

function safeTimezone(input: unknown): string | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  const tz = input.trim();
  if (tz.length > 64) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return null;
  }
}

export async function readScoutingReport(
  ctx: NetworkCtx,
  input: {
    /** `?team=` brut. */
    target: unknown;
    /** `?tz=` brut (repli si la joueuse n'a pas déclaré de fuseau). */
    tz: unknown;
    /** Équipe active demandée (`?teamId=`), déjà validée. */
    requestedTeamId: string | null;
  }
): Promise<ScoutingResponse> {
  const targetId = typeof input.target === 'string' ? input.target.trim() : '';
  if (!targetId) throw new LegacyAdminError(400, 'Équipe cible manquante.');

  const { db, tenantId, userId } = ctx;
  const myTeam = await findMemberTeam(userId, tenantId, input.requestedTeamId);
  if (!myTeam) {
    throw new LegacyAdminError(403, 'Tu dois appartenir à une équipe active.');
  }
  if (myTeam.id === targetId) {
    // Se scouter soi-même produirait un dossier absurde.
    throw new LegacyAdminError(400, 'Choisis une autre équipe que la tienne.');
  }

  const { row: target, error } = await repo.readScoutTarget(
    db,
    tenantId,
    targetId
  );
  if (error) {
    ctx.logger.error('[scouting] target error', error);
    throw new LegacyAdminError(500, "Lecture de l'équipe impossible.");
  }
  if (!target || target.deleted_at || target.is_active === false) {
    throw new LegacyAdminError(404, 'Équipe introuvable.');
  }

  const timezone =
    (await loadMyRhythmTimezone(tenantId, userId)) ||
    safeTimezone(input.tz) ||
    'Europe/Paris';

  const [myGames, theirGames, rating, reliability, notes] = await Promise.all([
    loadPlayedGames(tenantId, myTeam.id),
    loadPlayedGames(tenantId, target.id),
    repo.readTeamRating(db, tenantId, target.id),
    loadTeamReliability(tenantId, target.id),
    repo.listMyReviewsOn(db, {
      tenantId,
      myTeamId: myTeam.id,
      opponentTeamId: target.id,
    }),
  ]);

  const report = buildScoutingReport(
    myTeam.id,
    target.id,
    myGames,
    theirGames,
    getTimeZoneOffsetMinutes(new Date(), timezone)
  );

  // Noms des adversaires communs — sans eux, la section n'est qu'une liste
  // d'UUID.
  const teamNames: Record<string, string> = {};
  const commonIds = report.commonOpponents.map((c) => c.teamId);
  if (commonIds.length > 0) {
    for (const row of await repo.listTeamNames(db, commonIds)) {
      teamNames[row.id] = row.name;
    }
  }

  return {
    myTeam,
    target: {
      id: target.id,
      name: target.name,
      shortName: target.short_name,
      logoUrl: target.logo_url,
      slug: target.slug,
      country: target.country,
      rating,
      reliability: reliability ?? EMPTY_RELIABILITY,
    },
    report,
    teamNames,
    myNotes: notes.map((row) => ({
      subjectType: row.subject_type as 'match' | 'scrim',
      subjectId: row.subject_id as string,
      playedAt: (row.played_at as string | null) ?? null,
      vodUrl: (row.vod_url as string | null) ?? null,
      notes: (row.notes as string | null) ?? null,
    })),
    timezone,
  };
}
