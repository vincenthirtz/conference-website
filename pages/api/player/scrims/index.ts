// pages/api/player/scrims/index.ts
//
// GET — les scrims de MON équipe.
//
// Surface qui manquait : le tableau de bord montrait les NÉGOCIATIONS
// (demandes type='scrim') et les grilles de dispo, mais jamais les scrims
// eux-mêmes. Une équipe n'avait donc aucun endroit où voir « on joue contre qui
// jeudi ? », et encore moins où rapporter le score une fois joué.
//
// Renvoie trois paquets, dans l'ordre où on s'en sert :
//   - `toReport` : joués (ou datés dans le passé) et sans résultat validé —
//     c'est ce qui appelle une action ;
//   - `upcoming` : à venir ;
//   - `recent`   : clos, pour mémoire.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withSubjectRoute } from '@/utils/subject';
import { getManagedTeamForRequest } from '@/utils/teams/teamScope';
import { logger } from '@/utils/logger';

export type PlayerScrim = {
  id: string;
  name: string | null;
  scheduledDate: string | null;
  status: string;
  ranked: boolean;
  /** Mon équipe est-elle team1 ? Détermine la lecture des scores. */
  isTeam1: boolean;
  opponentName: string | null;
  team1Score: number | null;
  team2Score: number | null;
  winnerTeamId: string | null;
  disputeReason: string | null;
  /** Mon camp a-t-il déjà rapporté un score ? */
  myReport: { team1Score: number; team2Score: number } | null;
};

export default withSubjectRoute(
  async function handler(
    req: NextApiRequest,
    res: NextApiResponse,
    { subject }
  ) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (
      applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'player-scrims')
    ) {
      return;
    }

    const { userId, tenantId } = subject;

    const access = await getManagedTeamForRequest(req, userId, tenantId);
    if (!access) {
      // Pas d'équipe gérée : ce n'est pas une erreur, il n'y a simplement rien.
      return res
        .status(200)
        .json({ toReport: [], upcoming: [], recent: [], teamId: null });
    }

    const teamId = access.teamId;

    const { data: scrimRows, error } = await supabaseAdmin
      .from('scrims')
      .select(
        'id, name, scheduled_date, status, ranked, team1_id, team2_id, team1_score, team2_score, winner_team_id, dispute_reason'
      )
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .neq('status', 'draft')
      .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
      .order('scheduled_date', { ascending: false, nullsFirst: false })
      .limit(50);

    if (error) {
      logger.error('[player/scrims] read error', error);
      return res.status(500).json({ error: 'Lecture des scrims impossible.' });
    }

    const rows = (scrimRows || []) as Array<Record<string, unknown>>;

    // Noms d'adversaires + mes reports, en deux requêtes groupées.
    const opponentIds = new Set<string>();
    for (const row of rows) {
      const other =
        row.team1_id === teamId
          ? (row.team2_id as string | null)
          : (row.team1_id as string | null);
      if (other) opponentIds.add(other);
    }

    const [oppRes, reportsRes] = await Promise.all([
      opponentIds.size > 0
        ? supabaseAdmin
            .from('teams')
            .select('id, name')
            .in('id', Array.from(opponentIds))
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      rows.length > 0
        ? supabaseAdmin
            .from('scrim_score_reports')
            .select('scrim_id, team_side, team1_score, team2_score')
            .eq('tenant_id', tenantId)
            .in(
              'scrim_id',
              rows.map((r) => r.id as string)
            )
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    ]);

    const opponentName = new Map<string, string>();
    for (const t of (oppRes.data || []) as Array<{
      id: string;
      name: string;
    }>) {
      opponentName.set(t.id, t.name);
    }

    const myReports = new Map<
      string,
      { team1Score: number; team2Score: number }
    >();
    for (const r of (reportsRes.data || []) as Array<Record<string, unknown>>) {
      myReports.set(`${r.scrim_id}:${r.team_side}`, {
        team1Score: r.team1_score as number,
        team2Score: r.team2_score as number,
      });
    }

    const now = Date.now();
    const toReport: PlayerScrim[] = [];
    const upcoming: PlayerScrim[] = [];
    const recent: PlayerScrim[] = [];

    for (const row of rows) {
      const isTeam1 = row.team1_id === teamId;
      const otherId = isTeam1
        ? (row.team2_id as string | null)
        : (row.team1_id as string | null);
      const mySide = isTeam1 ? 1 : 2;
      const scheduled = (row.scheduled_date as string | null) ?? null;

      const scrim: PlayerScrim = {
        id: row.id as string,
        name: (row.name as string | null) ?? null,
        scheduledDate: scheduled,
        status: row.status as string,
        ranked: row.ranked !== false,
        isTeam1,
        opponentName: otherId ? (opponentName.get(otherId) ?? null) : null,
        team1Score: (row.team1_score as number | null) ?? null,
        team2Score: (row.team2_score as number | null) ?? null,
        winnerTeamId: (row.winner_team_id as string | null) ?? null,
        disputeReason: (row.dispute_reason as string | null) ?? null,
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

    res.setHeader('Cache-Control', 'private, max-age=15');
    return res.status(200).json({
      toReport,
      upcoming,
      recent: recent.slice(0, 10),
      teamId,
    });
  },
  { tenantResolution: 'async' }
);
