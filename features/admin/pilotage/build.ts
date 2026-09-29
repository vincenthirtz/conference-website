// features/admin/pilotage/build.ts — la file d'attente du pilotage du jour,
// TRIÉE PAR URGENCE ET NON PAR HEURE (planche « Admin »). PUR : reçoit les
// données du tableau de bord de tournoi et l'heure, rend ce que l'écran
// affiche. C'est ici qu'on décide ce qui passe devant.
//
//   1. litige     — un score contesté bloque la suite du tournoi ;
//   2. en direct  — à suivre ;
//   3. en retard  — l'heure est passée et le match n'a pas commencé ;
//   4. imminent   — dans les deux heures (le check-in se joue maintenant) ;
//   5. planifié   — le reste.
// À état égal, l'heure prévue départage. Un match n'apparaît qu'une fois,
// sous son état le plus urgent.

import type { DashboardData } from '@/utils/dashboard/buildTournamentDashboard';
import type { Pilotage, PilotageQueueItem, PilotageState } from './schemas';

const SOON_MS = 2 * 60 * 60 * 1000;
const RANK: Record<PilotageState, number> = {
  dispute: 0,
  live: 1,
  late: 2,
  soon: 3,
  planned: 4,
};
const ACTIVITY_MAX = 6;

function time(iso: string | null): number {
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

export function buildPilotageQueue(
  data: Pick<DashboardData, 'signals' | 'upcomingMatches'>,
  now: Date
): PilotageQueueItem[] {
  const byId = new Map<string, PilotageQueueItem>();
  const put = (item: PilotageQueueItem) => {
    const prev = byId.get(item.matchId);
    if (!prev || RANK[item.state] < RANK[prev.state])
      byId.set(item.matchId, item);
  };

  for (const d of data.signals.disputesOpen.matches) {
    put({
      matchId: d.id,
      state: 'dispute',
      roundName: null,
      team1: d.team1Name,
      team2: d.team2Name,
      scheduledAt: d.openedAt,
      score: null,
      detail: d.reason,
    });
  }
  for (const m of data.signals.liveMatches) {
    put({
      matchId: m.id,
      state: 'live',
      roundName: m.roundName,
      team1: m.team1Name,
      team2: m.team2Name,
      scheduledAt: m.scheduledAt,
      score:
        m.team1Score != null && m.team2Score != null
          ? `${m.team1Score}-${m.team2Score}`
          : null,
      detail: m.currentMap?.name ?? null,
    });
  }
  const nowMs = now.getTime();
  for (const m of data.upcomingMatches) {
    const at = time(m.scheduled_at);
    const state: PilotageState =
      at <= nowMs ? 'late' : at - nowMs <= SOON_MS ? 'soon' : 'planned';
    put({
      matchId: m.id,
      state,
      roundName: m.round_name,
      team1: m.team1_name,
      team2: m.team2_name,
      scheduledAt: m.scheduled_at,
      score: null,
      detail: m.stage_name,
    });
  }

  return [...byId.values()].sort(
    (a, b) =>
      RANK[a.state] - RANK[b.state] || time(a.scheduledAt) - time(b.scheduledAt)
  );
}

export function buildPilotage(data: DashboardData, now: Date): Pilotage {
  const c = data.signals.checkinNext24h;
  return {
    tournament: {
      id: data.tournament.id,
      name: data.tournament.name,
      startDate: data.tournament.start_date,
      endDate: data.tournament.end_date,
    },
    tiles: {
      checkin: {
        checkedIn: c.bothCheckedIn,
        upcoming: c.upcoming,
        missing: c.missing + c.oneSide,
      },
      ongoing: data.summary.ongoingMatches,
      toPlay: data.summary.pendingMatches,
      disputes: data.signals.disputesOpen.count,
      finished: data.summary.finishedMatches,
      total: data.summary.totalMatches,
    },
    queue: buildPilotageQueue(data, now),
    activity: data.signals.recentActivity.slice(0, ACTIVITY_MAX).map((a) => ({
      id: a.id,
      at: a.createdAt,
      staffName: a.staffName,
      action: a.readableAction,
    })),
    generatedAt: data.generatedAt,
  };
}

/** Pas de tournoi en cours : l'écran le dit, et propose la sortie. */
export function emptyPilotage(now: Date): Pilotage {
  return {
    tournament: null,
    tiles: null,
    queue: [],
    activity: [],
    generatedAt: now.toISOString(),
  };
}
