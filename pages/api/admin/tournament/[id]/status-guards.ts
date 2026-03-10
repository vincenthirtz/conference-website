// pages/api/admin/tournament/[id]/status-guards.ts
// GET : retourne pour chaque statut si la transition est autorisée + raisons
// Utilisé par le workflow visuel côté frontend

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';

type StatusGuard = {
  status: string;
  label: string;
  allowed: boolean;
  reason?: string;
};

type ApiResponse =
  | { current_status: string; guards: StatusGuard[] }
  | { error: string };

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  published: 'Publié',
  running: 'En cours',
  completed: 'Terminé',
  archived: 'Archivé',
};

export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  _ctx: any
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'Invalid tournament ID' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable' });
  }

  const tournamentId = String(id);

  try {
    // Fetch tournament
    const { data: tournament } = await supabaseAdmin
      .from('tournaments')
      .select('id, status')
      .eq('id', tournamentId)
      .maybeSingle();

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const currentStatus = tournament.status ?? 'draft';

    // Fetch counts in parallel
    const [stagesRes, teamsRes, matchesRes] = await Promise.all([
      supabaseAdmin
        .from('tournament_stages')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId),
      supabaseAdmin
        .from('tournament_teams')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId),
      supabaseAdmin
        .from('matches')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .neq('status', 'cancelled'),
    ]);

    const stagesCount = stagesRes.count ?? 0;
    const teamsCount = teamsRes.count ?? 0;
    const matchesCount = matchesRes.count ?? 0;

    const guards: StatusGuard[] = [];

    for (const status of ['draft', 'published', 'running', 'completed', 'archived']) {
      if (status === currentStatus) {
        guards.push({ status, label: STATUS_LABELS[status], allowed: false, reason: 'Statut actuel' });
        continue;
      }

      let allowed = true;
      let reason: string | undefined;

      switch (status) {
        case 'published':
          if (stagesCount === 0) {
            allowed = false;
            reason = 'Le tournoi doit avoir au moins 1 phase';
          }
          break;

        case 'running':
          if (stagesCount === 0) {
            allowed = false;
            reason = 'Le tournoi doit avoir au moins 1 phase';
          } else if (teamsCount === 0) {
            allowed = false;
            reason = 'Le tournoi doit avoir au moins 1 équipe';
          }
          break;

        case 'completed':
          if (currentStatus !== 'running') {
            allowed = false;
            reason = 'Le tournoi doit être en cours';
          }
          break;

        case 'archived':
          // always allowed
          break;

        case 'draft':
          // always allowed (regression)
          break;
      }

      guards.push({ status, label: STATUS_LABELS[status], allowed, reason });
    }

    return res.status(200).json({
      current_status: currentStatus,
      guards,
    });
  } catch (err: any) {
    console.error('[/api/admin/tournament/[id]/status-guards] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
