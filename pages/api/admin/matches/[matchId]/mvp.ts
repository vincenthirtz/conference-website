// pages/api/admin/matches/[matchId]/mvp.ts
// Admin: read MVP poll state and import the winner manually.
// - GET    : poll status + candidate roster
// - POST   : { winnerMemberId } -> store winner
// - DELETE : clear winner

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';

export default withStaffRoute(handler, 'caster');

async function handler(req: NextApiRequest, res: NextApiResponse, ctx: any) {
  const { matchId } = req.query;
  if (!matchId || Array.isArray(matchId) || !isValidUUID(matchId)) {
    return res.status(400).json({ error: 'Invalid matchId' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible' });
  }

  const id = String(matchId);

  try {
    if (req.method === 'GET') {
      return await handleGet(id, res);
    }
    if (req.method === 'POST') {
      return await handlePost(id, req, res, ctx);
    }
    if (req.method === 'DELETE') {
      return await handleDelete(id, res, ctx);
    }
    res.setHeader('Allow', 'GET,POST,DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[admin/matches/mvp] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleGet(matchId: string, res: NextApiResponse) {
  // 1) Fetch match basics
  const { data: match } = await supabaseAdmin
    .from('matches')
    .select('id, status, team1_id, team2_id, tournament_id')
    .eq('id', matchId)
    .maybeSingle();

  if (!match) {
    return res.status(404).json({ error: 'Match introuvable' });
  }

  // 2) Fetch the MVP poll row (if any)
  const { data: poll } = await supabaseAdmin
    .from('match_mvp_polls')
    .select('*')
    .eq('match_id', matchId)
    .maybeSingle();

  // 3) Fetch the rosters of both teams (non-substitutes only, for the dropdown)
  const teamIds = [match.team1_id, match.team2_id].filter(
    (x): x is string => !!x
  );

  let candidates: {
    id: string;
    teamId: string;
    teamName: string | null;
    battleTag: string | null;
    isSubstitute: boolean;
  }[] = [];

  if (teamIds.length > 0) {
    const { data: members } = await supabaseAdmin
      .from('team_members')
      .select(
        `
        id, team_id, battle_tag, is_substitute,
        team:team_id(id, name)
        `
      )
      .in('team_id', teamIds);

    candidates = (members || []).map((m: any) => {
      const team = Array.isArray(m.team) ? m.team[0] : m.team;
      return {
        id: m.id,
        teamId: m.team_id,
        teamName: team?.name ?? null,
        battleTag: m.battle_tag ?? null,
        isSubstitute: !!m.is_substitute,
      };
    });
  }

  return res.status(200).json({
    matchId,
    matchStatus: match.status,
    poll: poll || null,
    candidates,
  });
}

async function handlePost(
  matchId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: any
) {
  const { winnerMemberId } = req.body || {};
  if (!winnerMemberId || typeof winnerMemberId !== 'string' || !isValidUUID(winnerMemberId)) {
    return res.status(400).json({ error: 'winnerMemberId invalide' });
  }

  // Validate that the member belongs to one of the match teams
  const { data: match } = await supabaseAdmin
    .from('matches')
    .select('id, team1_id, team2_id, tournament_id')
    .eq('id', matchId)
    .maybeSingle();

  if (!match) {
    return res.status(404).json({ error: 'Match introuvable' });
  }

  const { data: member } = await supabaseAdmin
    .from('team_members')
    .select('id, team_id, battle_tag')
    .eq('id', winnerMemberId)
    .maybeSingle();

  if (!member) {
    return res.status(404).json({ error: 'Joueuse introuvable' });
  }

  if (member.team_id !== match.team1_id && member.team_id !== match.team2_id) {
    return res.status(400).json({
      error: 'La joueuse ne fait pas partie d\'une des deux équipes du match',
    });
  }

  const now = new Date().toISOString();
  const update = {
    winner_member_id: winnerMemberId,
    winner_battle_tag: member.battle_tag ?? null,
    winner_imported_at: now,
    winner_imported_by: ctx?.staff?.auth_user_id ?? null,
    updated_at: now,
  };

  // Upsert: there might already be a poll row from auto-post, or none if it
  // never posted (no Discord webhook configured).
  const { data: existing } = await supabaseAdmin
    .from('match_mvp_polls')
    .select('id')
    .eq('match_id', matchId)
    .maybeSingle();

  let result;
  if (existing?.id) {
    const { data, error } = await supabaseAdmin
      .from('match_mvp_polls')
      .update(update)
      .eq('id', existing.id)
      .select('*')
      .maybeSingle();
    if (error) {
      console.error('[admin/matches/mvp] update error:', error);
      return res.status(500).json({ error: 'Échec de l\'enregistrement' });
    }
    result = data;
  } else {
    const { data, error } = await supabaseAdmin
      .from('match_mvp_polls')
      .insert({
        match_id: matchId,
        ...update,
      })
      .select('*')
      .maybeSingle();
    if (error) {
      console.error('[admin/matches/mvp] insert error:', error);
      return res.status(500).json({ error: 'Échec de l\'enregistrement' });
    }
    result = data;
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'import_mvp',
      entity_type: 'match',
      entity_id: matchId,
      tournament_id: match.tournament_id ?? null,
      payload: {
        winner_member_id: winnerMemberId,
        winner_battle_tag: member.battle_tag,
      },
    });
  }

  return res.status(200).json({ poll: result });
}

async function handleDelete(matchId: string, res: NextApiResponse, ctx: any) {
  const { data, error } = await supabaseAdmin
    .from('match_mvp_polls')
    .update({
      winner_member_id: null,
      winner_battle_tag: null,
      winner_imported_at: null,
      winner_imported_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq('match_id', matchId)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('[admin/matches/mvp] clear error:', error);
    return res.status(500).json({ error: 'Échec' });
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'import_mvp',
      entity_type: 'match',
      entity_id: matchId,
      tournament_id: null,
      payload: { cleared: true },
    });
  }

  return res.status(200).json({ poll: data });
}
