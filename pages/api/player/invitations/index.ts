// pages/api/player/invitations/index.ts
// GET — list the authenticated player's pending team invitations.
//
// Web (player) counterpart of the bot endpoint
// `/api/bot/v1/players/by-discord/[discordUserId]/invitations`. Uses web auth
// (Bearer → withAuthRoute) instead of the bot `x-api-key`, and scopes to the
// caller's own auth user (no Discord-id indirection).
//
// Shape:
//   { invitations: [{ id, teamId, teamName, role, specialty, battleTag,
//                     expiresAt, createdAt }] }

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withSubjectRoute } from '@/utils/subject';
import { listPendingInvitationsForUser } from '@/utils/teams/invitations';
import { logger } from '@/utils/logger';

export type PlayerInvitation = {
  id: string;
  teamId: string | null;
  teamName: string | null;
  role: string;
  specialty: string | null;
  battleTag: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type PlayerInvitationsPayload = {
  invitations: PlayerInvitation[];
};

export default withSubjectRoute(
  async function handler(
    req: NextApiRequest,
    res: NextApiResponse<PlayerInvitationsPayload | { error: string }>,
    { subject }
  ) {
    if (
      applyRateLimit(
        req,
        res,
        { max: 60, windowMs: 60_000 },
        'player-invitations'
      )
    ) {
      return;
    }

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { userId, tenantId } = subject;

    const result = await listPendingInvitationsForUser(tenantId, userId);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    // Enrich with the team name (1 batched query), mirroring the bot list
    // endpoint. The web client only needs the human-readable name.
    const teamIds = Array.from(
      new Set(result.data.map((d) => d.team_id).filter((x): x is string => !!x))
    );
    const teamsById = new Map<string, { id: string; name: string }>();
    if (teamIds.length > 0) {
      const { data: teams, error: teamsErr } = await supabaseAdmin
        .from('teams')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .in('id', teamIds);
      if (teamsErr) {
        logger.error('[player/invitations] teams enrich error', teamsErr);
      } else {
        for (const t of teams ?? []) {
          teamsById.set(t.id, t as { id: string; name: string });
        }
      }
    }

    const invitations: PlayerInvitation[] = result.data.map((d) => ({
      id: d.id,
      teamId: d.team_id,
      teamName: d.team_id ? (teamsById.get(d.team_id)?.name ?? null) : null,
      role: d.payload?.desired_role ?? 'player',
      specialty: d.payload?.specialty ?? null,
      battleTag: d.payload?.battle_tag ?? null,
      expiresAt: d.payload?.expires_at ?? null,
      createdAt: d.created_at,
    }));

    res.setHeader('Cache-Control', 'private, max-age=10');
    return res.status(200).json({ invitations });
  },
  { tenantResolution: 'async' }
);
