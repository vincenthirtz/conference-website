// @ts-nocheck
// pages/api/admin/matches/[matchId]/history.ts
// Historique staff d’un match spécifique.
// - GET : retourne la liste des actions staff liées au match
//         (logs avec entity_type = "match" + logs de type "game" liés au match via payload.match_id)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { formatStaffLog, StaffLog } from '@/utils/staffLogs';

export default withStaffRoute(handler, 'referee'); // arbitres & + peuvent voir l’historique

type MatchHistoryResponse = {
  matchId: string;
  logs: Array<ReturnType<typeof formatStaffLog>>;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    MatchHistoryResponse | { error: string; detail?: string }
  >,
  _ctx: any
) {
  const { matchId } = req.query;

  if (!matchId || Array.isArray(matchId)) {
    return res.status(400).json({ error: 'Invalid matchId' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const id = String(matchId);

    // 1) Logs directement attachés au match (entity_type = "match", entity_id = matchId)
    const { data: matchLogs, error: matchErr } = await supabaseAdmin
      .from('staff_logs')
      .select(
        `
        id,
        created_at,
        staff_id,
        action,
        entity_type,
        entity_id,
        tournament_id,
        payload,
        staff:staff(
          id,
          auth_user_id,
          role,
          display_name,
          avatar_url
        )
      `
      )
      .eq('entity_type', 'match')
      .eq('entity_id', id)
      .order('created_at', { ascending: false });

    if (matchErr) {
      console.error('match history: matchLogs error:', matchErr);
    }

    // 2) Logs sur les maps/games rattachés au match (entity_type = "game" + payload.match_id)
    const { data: gameLogs, error: gameErr } = await supabaseAdmin
      .from('staff_logs')
      .select(
        `
        id,
        created_at,
        staff_id,
        action,
        entity_type,
        entity_id,
        tournament_id,
        payload,
        staff:staff(
          id,
          auth_user_id,
          role,
          display_name,
          avatar_url
        )
      `
      )
      .eq('entity_type', 'game')
      .contains('payload', { match_id: id })
      .order('created_at', { ascending: false });

    if (gameErr) {
      console.error('match history: gameLogs error:', gameErr);
    }

    // 3) Merge + tri chrono desc
    const rawLogs = [
      ...(((matchLogs as StaffLog[]) ?? []) as StaffLog[]),
      ...(((gameLogs as StaffLog[]) ?? []) as StaffLog[]),
    ];

    rawLogs.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    const formatted = rawLogs.map((log) => formatStaffLog(log));

    return res.status(200).json({
      matchId: id,
      logs: formatted,
    });
  } catch (err: any) {
    console.error('[/api/admin/matches/[matchId]/history] error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      detail: err?.message,
    });
  }
}
