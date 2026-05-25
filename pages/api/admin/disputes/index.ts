// pages/api/admin/disputes/index.ts
// GET : cross-tournament board of open disputes for /admin/disputes.
// Returns the same shape as the bot /disputes/escalations endpoint but
// scoped to the staff member's current tenant (via ctx.tenantId).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import { listOpenDisputes } from '@/utils/disputes/slaBreaches';
import { logger } from '../../../../utils/logger';

function queryString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

export default withStaffRoute(handler, 'caster');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tournamentId = queryString(req.query.tournament_id);
  if (tournamentId && !isValidUUID(tournamentId)) {
    return res.status(400).json({ error: 'Invalid tournament_id' });
  }

  try {
    const rows = await listOpenDisputes(ctx.tenantId, { tournamentId });

    const teamIds = new Set<string>();
    const tournamentIds = new Set<string>();
    for (const r of rows) {
      if (r.team1Id) teamIds.add(r.team1Id);
      if (r.team2Id) teamIds.add(r.team2Id);
      if (r.tournamentId) tournamentIds.add(r.tournamentId);
    }

    const teamNames = new Map<string, string>();
    if (teamIds.size > 0) {
      const { data: teams } = await supabaseAdmin
        .from('teams')
        .select('id, name')
        .eq('tenant_id', ctx.tenantId)
        .in('id', Array.from(teamIds));
      for (const t of (teams ?? []) as any[]) {
        teamNames.set(t.id, t.name);
      }
    }

    const tournamentInfo = new Map<
      string,
      { id: string; name: string; slug: string | null }
    >();
    if (tournamentIds.size > 0) {
      const { data: tns } = await supabaseAdmin
        .from('tournaments')
        .select('id, name, slug')
        .eq('tenant_id', ctx.tenantId)
        .in('id', Array.from(tournamentIds));
      for (const t of (tns ?? []) as any[]) {
        tournamentInfo.set(t.id, {
          id: t.id,
          name: t.name,
          slug: t.slug ?? null,
        });
      }
    }

    const disputes = rows.map((r) => ({
      matchId: r.matchId,
      tournament: r.tournamentId
        ? (tournamentInfo.get(r.tournamentId) ?? null)
        : null,
      team1: r.team1Id
        ? { id: r.team1Id, name: teamNames.get(r.team1Id) ?? null }
        : null,
      team2: r.team2Id
        ? { id: r.team2Id, name: teamNames.get(r.team2Id) ?? null }
        : null,
      disputeReason: r.disputeReason,
      disputeOpenedAt: r.disputeOpenedAt,
      escalationPingedAt: r.escalationPingedAt,
      ageMinutes: r.ageMinutes,
      slaMinutes: r.slaMinutes,
      classification: r.classification,
    }));

    const counts = {
      total: disputes.length,
      breached: disputes.filter((d) => d.classification === 'breached').length,
      approaching: disputes.filter(
        (d) => d.classification === 'approaching'
      ).length,
      fresh: disputes.filter((d) => d.classification === 'fresh').length,
    };

    return res.status(200).json({ disputes, counts });
  } catch (err) {
    logger.error('[/api/admin/disputes] error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
