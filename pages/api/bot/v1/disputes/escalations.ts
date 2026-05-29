// GET /api/bot/v1/disputes/escalations
//
// Lot 4 — Returns open disputes ranked by SLA urgency for the bot to
// surface in /disputes-board or its DM escalation routine. The dataset
// is per-tenant (resolved via x-tenant-id header by `withBotRoute`).
//
// Query :
//   - tournament : UUID, optional filter
//   - limit      : 1..50, default 30 (more than /disputes since this is
//                  a board, not a quick command)
//   - breached   : 'true' restricts the response to rows where
//                  `escalation_pinged_at IS NULL` AND age >= SLA. Useful
//                  for the bot's "ping pending" pass.
//
// Auth : x-api-key (and x-tenant-id when using the env key, per the
// canonical bot contract).

import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { isValidUUID } from '@/utils/apiHelpers';
import { listOpenDisputes } from '@/utils/disputes/slaBreaches';
import { logger } from '@/utils/logger';

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 30;

function queryString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const tournamentId = queryString(req.query.tournament);
  if (tournamentId && !isValidUUID(tournamentId)) {
    return res.status(400).json({ error: 'tournament invalide' });
  }

  const rawLimit = Number(req.query.limit);
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;
  const breachedOnly = queryString(req.query.breached) === 'true';

  const tenantId = req.botContext.tenantId;

  try {
    const rows = await listOpenDisputes(tenantId, { tournamentId });

    let filtered = rows;
    if (breachedOnly) {
      filtered = rows.filter(
        (r) => r.classification === 'breached' && r.escalationPingedAt === null
      );
    }
    const trimmed = filtered.slice(0, limit);

    // Enrich with team + tournament names — same shape as /disputes for
    // bot-side rendering convenience.
    const teamIds = new Set<string>();
    const tournamentIds = new Set<string>();
    for (const r of trimmed) {
      if (r.team1Id) teamIds.add(r.team1Id);
      if (r.team2Id) teamIds.add(r.team2Id);
      if (r.tournamentId) tournamentIds.add(r.tournamentId);
    }

    const teamNames = new Map<string, string>();
    if (teamIds.size > 0) {
      const { data: teams } = await supabaseAdmin
        .from('teams')
        .select('id, name')
        .eq('tenant_id', tenantId)
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
        .eq('tenant_id', tenantId)
        .in('id', Array.from(tournamentIds));
      for (const t of (tns ?? []) as any[]) {
        tournamentInfo.set(t.id, {
          id: t.id,
          name: t.name,
          slug: t.slug ?? null,
        });
      }
    }

    const escalations = trimmed.map((r) => {
      const openedMs = r.disputeOpenedAt ? Date.parse(r.disputeOpenedAt) : NaN;
      const slaDueAt =
        Number.isFinite(openedMs) && Number.isFinite(r.slaMinutes)
          ? new Date(openedMs + r.slaMinutes * 60_000).toISOString()
          : null;
      return {
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
        disputeThreadId: r.disputeThreadId,
        slaDueAt,
        ageMinutes: r.ageMinutes,
        slaMinutes: r.slaMinutes,
        classification: r.classification,
      };
    });

    return res.status(200).json({
      escalations,
      count: escalations.length,
      total: filtered.length,
    });
  } catch (err) {
    logger.error('[bot/disputes/escalations] error', err);
    return res
      .status(500)
      .json({ error: 'Erreur de lecture des escalations dispute' });
  }
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 30, key: 'bot-disputes-escalations' },
});
