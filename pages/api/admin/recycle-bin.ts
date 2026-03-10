// pages/api/admin/recycle-bin.ts
// GET  : liste les éléments soft-deleted (stages inactives, teams inactives, matches annulés)
// PATCH: restaurer un élément soft-deleted

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';

type DeletedItem = {
  id: string;
  type: 'stage' | 'team' | 'match';
  name: string;
  details: string | null;
  deleted_at: string | null;
  tournament_id: string | null;
};

type ApiResponse =
  | { items: DeletedItem[]; total: number }
  | { restored: boolean; type: string; id: string }
  | { error: string };

export default withStaffRoute(handler, 'admin');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: any
) {
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  switch (req.method) {
    case 'GET':
      return handleGet(req, res);
    case 'PATCH':
      return handleRestore(req, res, ctx);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  const typeFilter = req.query.type as string | undefined;
  const items: DeletedItem[] = [];

  // 1) Soft-deleted stages (is_active = false)
  if (!typeFilter || typeFilter === 'stage') {
    const { data: stages } = await supabaseAdmin!
      .from('tournament_stages')
      .select('id, name, stage_type, tournament_id, updated_at')
      .eq('is_active', false)
      .order('updated_at', { ascending: false })
      .limit(100);

    for (const s of stages || []) {
      items.push({
        id: s.id,
        type: 'stage',
        name: s.name || 'Phase sans nom',
        details: s.stage_type || null,
        deleted_at: s.updated_at,
        tournament_id: s.tournament_id,
      });
    }
  }

  // 2) Soft-deleted teams (is_active = false)
  if (!typeFilter || typeFilter === 'team') {
    const { data: teams } = await supabaseAdmin!
      .from('teams')
      .select('id, name, short_name, updated_at')
      .eq('is_active', false)
      .order('updated_at', { ascending: false })
      .limit(100);

    for (const t of teams || []) {
      items.push({
        id: t.id,
        type: 'team',
        name: t.name || 'Equipe sans nom',
        details: t.short_name || null,
        deleted_at: t.updated_at,
        tournament_id: null,
      });
    }
  }

  // 3) Cancelled matches (status = 'cancelled')
  if (!typeFilter || typeFilter === 'match') {
    const { data: matches } = await supabaseAdmin!
      .from('matches')
      .select(
        'id, tournament_id, stage_id, round_number, team1_id, team2_id, updated_at'
      )
      .eq('status', 'cancelled')
      .order('updated_at', { ascending: false })
      .limit(100);

    // Fetch team names for match labels
    const teamIds = new Set<string>();
    for (const m of matches || []) {
      if (m.team1_id) teamIds.add(m.team1_id);
      if (m.team2_id) teamIds.add(m.team2_id);
    }

    const teamNameMap = new Map<string, string>();
    if (teamIds.size > 0) {
      const { data: teamsData } = await supabaseAdmin!
        .from('teams')
        .select('id, name')
        .in('id', Array.from(teamIds));

      for (const t of teamsData || []) {
        teamNameMap.set(t.id, t.name);
      }
    }

    for (const m of matches || []) {
      const t1 = m.team1_id ? (teamNameMap.get(m.team1_id) || 'TBD') : 'TBD';
      const t2 = m.team2_id ? (teamNameMap.get(m.team2_id) || 'TBD') : 'TBD';
      items.push({
        id: m.id,
        type: 'match',
        name: `${t1} vs ${t2}`,
        details: m.round_number ? `Round ${m.round_number}` : null,
        deleted_at: m.updated_at,
        tournament_id: m.tournament_id,
      });
    }
  }

  // Sort all by deleted_at descending
  items.sort((a, b) => {
    const da = a.deleted_at ? new Date(a.deleted_at).getTime() : 0;
    const db = b.deleted_at ? new Date(b.deleted_at).getTime() : 0;
    return db - da;
  });

  return res.status(200).json({ items, total: items.length });
}

async function handleRestore(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: any
) {
  const { id, type } = req.body || {};

  if (!id || !type) {
    return res.status(400).json({ error: 'id and type are required' });
  }

  const nowIso = new Date().toISOString();

  try {
    switch (type) {
      case 'stage': {
        const { error } = await supabaseAdmin!
          .from('tournament_stages')
          .update({ is_active: true, is_public: true, updated_at: nowIso })
          .eq('id', id);

        if (error) throw error;
        break;
      }
      case 'team': {
        const { error } = await supabaseAdmin!
          .from('teams')
          .update({ is_active: true, updated_at: nowIso })
          .eq('id', id);

        if (error) throw error;
        break;
      }
      case 'match': {
        const { error } = await supabaseAdmin!
          .from('matches')
          .update({ status: 'pending', updated_at: nowIso })
          .eq('id', id)
          .eq('status', 'cancelled');

        if (error) throw error;
        break;
      }
      default:
        return res.status(400).json({ error: `Unknown type: ${type}` });
    }

    // Log staff action
    if (ctx?.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'other',
          entity_type: type,
          entity_id: id,
          payload: { action_label: 'restore_item', type, restored_at: nowIso },
        });
      } catch (e) {
        console.error('recycle-bin logStaffAction error:', e);
      }
    }

    return res.status(200).json({ restored: true, type, id });
  } catch (err: any) {
    console.error('[/api/admin/recycle-bin] restore error:', err);
    return res
      .status(500)
      .json({ error: err?.message || 'Failed to restore item' });
  }
}
