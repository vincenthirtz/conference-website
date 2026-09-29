// features/player/scrims/service/myScrims.ts — les scrims de MON équipe
// (GET /api/player/scrims). Déplacé tel quel (lot P13).
//
// Trois paquets, dans l'ordre où on s'en sert : `toReport` (joués ou datés
// dans le passé, sans résultat validé — appelle une action), `upcoming`,
// `recent` (clos, pour mémoire).

import { LegacyAdminError } from '@/utils/admin/errors';
import { getManagedTeam } from '@/utils/teams/managementAccess';
import {
  listReportsFor,
  listTeamNames,
  listTeamScrims,
} from '../repository/myScrims';
import type { PlayerScrim, PlayerScrimsResponse } from '../schemas';
import type { ScrimsCtx } from './context';

export async function listMyScrims(
  ctx: ScrimsCtx,
  requestedTeamId: string | null
): Promise<PlayerScrimsResponse> {
  const { db, tenantId } = ctx;
  const access = await getManagedTeam(ctx.userId, tenantId, requestedTeamId);
  // Pas d'équipe gérée : ce n'est pas une erreur, il n'y a simplement rien.
  if (!access) return { toReport: [], upcoming: [], recent: [], teamId: null };

  const teamId = access.teamId;
  const { rows, error } = await listTeamScrims(db, tenantId, teamId);
  if (error) {
    ctx.logger.error('[player/scrims] read error', error);
    throw new LegacyAdminError(500, 'Lecture des scrims impossible.');
  }

  const opponentIds = new Set<string>();
  for (const row of rows) {
    const other = row.team1_id === teamId ? row.team2_id : row.team1_id;
    if (other) opponentIds.add(other);
  }

  const [opponents, reports] = await Promise.all([
    listTeamNames(db, Array.from(opponentIds)),
    listReportsFor(
      db,
      tenantId,
      rows.map((r) => r.id)
    ),
  ]);

  const opponentName = new Map(opponents.map((t) => [t.id, t.name]));
  const myReports = new Map<
    string,
    { team1Score: number; team2Score: number }
  >();
  for (const r of reports) {
    myReports.set(`${r.scrim_id}:${r.team_side}`, {
      team1Score: r.team1_score,
      team2Score: r.team2_score,
    });
  }

  const now = Date.now();
  const toReport: PlayerScrim[] = [];
  const upcoming: PlayerScrim[] = [];
  const recent: PlayerScrim[] = [];

  for (const row of rows) {
    const isTeam1 = row.team1_id === teamId;
    const otherId = isTeam1 ? row.team2_id : row.team1_id;
    const mySide = isTeam1 ? 1 : 2;
    const scheduled = row.scheduled_date ?? null;

    const scrim: PlayerScrim = {
      id: row.id,
      name: row.name ?? null,
      scheduledDate: scheduled,
      status: row.status,
      ranked: row.ranked !== false,
      isTeam1,
      opponentName: otherId ? (opponentName.get(otherId) ?? null) : null,
      team1Score: row.team1_score ?? null,
      team2Score: row.team2_score ?? null,
      winnerTeamId: row.winner_team_id ?? null,
      disputeReason: row.dispute_reason ?? null,
      myReport: myReports.get(`${row.id}:${mySide}`) ?? null,
    };

    const isClosed =
      scrim.status === 'completed' || scrim.status === 'cancelled';
    const isPast = scheduled ? Date.parse(scheduled) < now : false;

    if (isClosed) recent.push(scrim);
    else if (
      isPast ||
      scrim.status === 'running' ||
      scrim.status === 'disputed'
    )
      toReport.push(scrim);
    else upcoming.push(scrim);
  }

  // À venir : le plus proche d'abord (l'ordre DB est décroissant).
  upcoming.reverse();
  return { toReport, upcoming, recent: recent.slice(0, 10), teamId };
}
