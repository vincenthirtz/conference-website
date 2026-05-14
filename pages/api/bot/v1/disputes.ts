// GET /api/bot/v1/disputes
//
// Commande /disputes (admin) : liste des matchs actuellement en dispute,
// avec leur raison + les deux reports si disponibles dans
// match_score_reports.
//
// Query :
//   - tournament : UUID, filtre
//   - limit      : 1..50, defaut 20
//
// Auth : x-api-key + actorDiscordUserId staff admin/owner (lu en query).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotStaff } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

function queryString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const actorDiscordUserId =
    queryString(req.query.actorDiscordUserId) ??
    queryString((req.body as Record<string, unknown> | null)?.actorDiscordUserId);
  const actor = await requireBotStaff(req, res, {
    actorDiscordUserId: actorDiscordUserId ?? '',
  });
  if (!actor) return;

  const rawLimit = Number(req.query.limit);
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const tournamentId = queryString(req.query.tournament);
  if (tournamentId && !isValidUUID(tournamentId)) {
    return res.status(400).json({ error: 'tournament invalide' });
  }

  let query = supabaseAdmin
    .from('matches')
    .select(
      `id, tournament_id, scheduled_at, round_number, round_name,
       dispute_reason, dispute_opened_at,
       team1:team1_id (id, name, short_name),
       team2:team2_id (id, name, short_name),
       tournament:tournament_id (id, name, slug)`
    )
    .eq('status', 'disputed')
    .order('dispute_opened_at', { ascending: false })
    .limit(limit);

  if (tournamentId) query = query.eq('tournament_id', tournamentId);

  const { data: matches, error } = await query;
  if (error) {
    logger.error('[bot/disputes] query error', error);
    return res.status(500).json({ error: 'Erreur de lecture des disputes' });
  }
  if (!matches || matches.length === 0) {
    return res.status(200).json({ disputes: [], count: 0 });
  }

  // Pull both score reports for each disputed match (batch).
  const matchIds = matches.map((m) => (m as { id: string }).id);
  const { data: reports } = await supabaseAdmin
    .from('match_score_reports')
    .select('match_id, team_side, team1_score, team2_score, reported_at, updated_at')
    .in('match_id', matchIds);

  const reportsByMatch = new Map<
    string,
    { side: number; t1: number; t2: number; at: string | null }[]
  >();
  for (const r of reports ?? []) {
    const list = reportsByMatch.get((r as any).match_id) ?? [];
    list.push({
      side: (r as any).team_side,
      t1: (r as any).team1_score,
      t2: (r as any).team2_score,
      at: (r as any).updated_at ?? (r as any).reported_at ?? null,
    });
    reportsByMatch.set((r as any).match_id, list);
  }

  const disputes = matches.map((m) => {
    const t1 = Array.isArray((m as any).team1)
      ? (m as any).team1[0]
      : (m as any).team1;
    const t2 = Array.isArray((m as any).team2)
      ? (m as any).team2[0]
      : (m as any).team2;
    const tn = Array.isArray((m as any).tournament)
      ? (m as any).tournament[0]
      : (m as any).tournament;
    const reps = reportsByMatch.get((m as any).id) ?? [];
    const repBySide = (s: number) => reps.find((r) => r.side === s) ?? null;

    return {
      matchId: (m as any).id,
      tournament: tn
        ? { id: tn.id, name: tn.name, slug: tn.slug ?? null }
        : null,
      round: (m as any).round_name ?? null,
      roundNumber: (m as any).round_number ?? null,
      scheduledAt: (m as any).scheduled_at ?? null,
      reason: (m as any).dispute_reason ?? null,
      openedAt: (m as any).dispute_opened_at ?? null,
      team1: t1 ? { id: t1.id, name: t1.name } : null,
      team2: t2 ? { id: t2.id, name: t2.name } : null,
      reports: {
        team1Reported: repBySide(1)
          ? { team1Score: repBySide(1)!.t1, team2Score: repBySide(1)!.t2 }
          : null,
        team2Reported: repBySide(2)
          ? { team1Score: repBySide(2)!.t1, team2Score: repBySide(2)!.t2 }
          : null,
      },
    };
  });

  return res.status(200).json({ disputes, count: disputes.length });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 30, key: 'bot-disputes' },
});
