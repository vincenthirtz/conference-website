import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { supabaseAdmin } from '@/utils/supabase';
import {
  resolveUserIdByEmail,
  insertTeamMember,
  setTeamCaptain,
} from '@/utils/teams/addMember';
// TODO(S5c): endpoint legacy "discord secret" — bascule-le sur le tenantId
// resolu depuis le body / un header dedie une fois la resolution publique
// multi-tenant en place. Le bot v1 (pages/api/bot/v1/teams/*) est la version
// moderne et porte deja req.botContext.tenantId.
import { DEFAULT_TENANT_ID } from '@/utils/tenant';

import { logger } from '../../../../utils/logger';
type Body = {
  team_id?: string;
  user_id?: string;
  email?: string;
  role?: string;
  set_captain?: boolean;
};

type ApiResponse =
  | {
      teamMemberId?: string;
      teamId: string;
      userId: string;
      role: string;
      captainSet: boolean;
      info?: string;
    }
  | { error: string };

const DISCORD_TEAM_SECRET = process.env.DISCORD_TEAM_SECRET;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!DISCORD_TEAM_SECRET) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  const token = extractToken(req);
  if (!token || !safeEqual(token, DISCORD_TEAM_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body: Body = req.body || {};
  const teamId = body.team_id?.trim();
  const role = body.role?.trim() || 'player';
  const setCaptain = Boolean(body.set_captain);

  if (!teamId) {
    return res.status(400).json({ error: "Field 'team_id' is required" });
  }

  let resolvedUserId = body.user_id?.trim() || '';

  try {
    // Verify team exists
    const { data: team, error: teamErr } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('id', teamId)
      .maybeSingle();

    if (teamErr || !team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Resolve user by email if no user_id provided (no auto-create cote bot)
    if (!resolvedUserId) {
      const email = body.email?.trim();
      if (!email) {
        return res.status(400).json({
          error: "Provide either 'user_id' or 'email' to find the user",
        });
      }
      const resolved = await resolveUserIdByEmail({ email, create: false });
      if (!resolved.ok) {
        return res.status(resolved.status).json({ error: resolved.error });
      }
      resolvedUserId = resolved.userId;
    }

    const insertResult = await insertTeamMember({
      // TODO(S5c): remplacer DEFAULT_TENANT_ID par le tenantId resolu de la
      // requete une fois la resolution publique multi-tenant en place.
      tenantId: DEFAULT_TENANT_ID,
      teamId,
      userId: resolvedUserId,
      role,
    });
    if (!insertResult.ok) {
      return res.status(insertResult.status).json({ error: insertResult.error });
    }

    let captainSet = false;
    if (setCaptain) {
      const captainResult = await setTeamCaptain(teamId, resolvedUserId);
      if (!captainResult.ok) {
        return res.status(captainResult.status).json({ error: captainResult.error });
      }
      captainSet = true;
    }

    return res.status(200).json({
      teamMemberId: insertResult.memberId ?? undefined,
      teamId,
      userId: resolvedUserId,
      role,
      captainSet,
      info: captainSet
        ? 'Member added and set as captain'
        : 'Member added to team',
    });
  } catch (err: unknown) {
    logger.error('[/api/discord/teams/add-member] error:', err);
    return res.status(500).json({
      error: (err as Error)?.message || 'Internal server error',
    });
  }
}

function extractToken(req: NextApiRequest) {
  const auth = req.headers.authorization;
  const raw = Array.isArray(auth) ? auth[0] : auth;
  if (!raw) return null;
  return raw.startsWith('Bearer ') ? raw.slice(7).trim() : raw.trim();
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
