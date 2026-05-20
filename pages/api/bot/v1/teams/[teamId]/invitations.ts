// /api/bot/v1/teams/[teamId]/invitations
//
//  GET  : liste les invitations emises par la team. Filtres : status (defaut
//         'pending'), type (defaut 'invite'), limit. Sert pour l'autocomplete
//         /inviter cancel cote bot et le tableau de bord capitaine.
//  POST : commande /inviter @membre — le capitaine cree une invitation
//         pending pour une joueuse. La joueuse accepte via DM du bot
//         (POST /api/bot/v1/invitations/[demandeId] { action: 'accept' }).
//
// Auth   : x-api-key. POST exige aussi actorDiscordUserId = capitaine de la
//          team. GET est public a la cle (x-api-key sur le bot suffit).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { requireBotPlayer, resolveActorPlayer } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import { createInvitation } from '@/utils/teams/invitations';
import { logPlayerAction } from '@/utils/botPlayerLogs';
import { logger } from '@/utils/logger';

const DISCORD_ID_RE = /^[0-9]{15,25}$/;
const COMMENT_MAX = 1000;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;
const VALID_STATUSES = new Set([
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'all',
]);

async function handleList(
  req: NextApiRequest,
  res: NextApiResponse,
  teamId: string
) {
  const rawStatus =
    typeof req.query.status === 'string' ? req.query.status.trim() : 'pending';
  const status = rawStatus.toLowerCase();
  if (!VALID_STATUSES.has(status)) {
    return res.status(400).json({
      error: `status invalide. Valeurs : ${[...VALID_STATUSES].join(', ')}.`,
    });
  }

  const type =
    typeof req.query.type === 'string' && req.query.type.trim()
      ? req.query.type.trim()
      : 'invite';

  const rawLimit = Number(req.query.limit);
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  let query = supabaseAdmin
    .from('demandes')
    .select(
      `id, user_id, team_id, type, status, comment, source, payload,
       created_at, processed_at`
    )
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('team_id', teamId)
    .eq('type', type)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    logger.error('[bot/team-invitations] list error', error);
    return res.status(500).json({ error: 'Erreur de lecture' });
  }

  const invitations = (data ?? []).map((row) => {
    const r = row as {
      id: string;
      user_id: string;
      type: string;
      status: string;
      comment: string | null;
      created_at: string;
      processed_at: string | null;
      payload: Record<string, unknown> | null;
    };
    const p = r.payload ?? {};
    return {
      id: r.id,
      type: r.type,
      status: r.status,
      createdAt: r.created_at,
      processedAt: r.processed_at,
      comment: r.comment,
      inviteeAuthUserId: r.user_id,
      inviteeDiscordUserId:
        typeof p.invitee_discord_user_id === 'string'
          ? (p.invitee_discord_user_id as string)
          : null,
      captainAuthUserId:
        typeof p.captain_auth_user_id === 'string'
          ? (p.captain_auth_user_id as string)
          : null,
      captainDiscordUserId:
        typeof p.captain_discord_user_id === 'string'
          ? (p.captain_discord_user_id as string)
          : null,
      desiredRole:
        typeof p.desired_role === 'string' ? (p.desired_role as string) : null,
      battleTag:
        typeof p.battle_tag === 'string' ? (p.battle_tag as string) : null,
      expiresAt:
        typeof p.expires_at === 'string' ? (p.expires_at as string) : null,
    };
  });

  return res
    .status(200)
    .json({ invitations, count: invitations.length, teamId });
}

async function handleCreate(
  req: NextApiRequest,
  res: NextApiResponse,
  teamId: string
) {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const actor = await requireBotPlayer(req, res, body);
  if (!actor) return;

  const { data: team, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, captain_id, name')
    .eq('tenant_id', req.botContext!.tenantId)
    .eq('id', teamId)
    .maybeSingle();
  if (teamErr) {
    logger.error('[bot/invitations] team lookup error', teamErr);
    return res.status(500).json({ error: 'Erreur de chargement de l’équipe' });
  }
  if (!team) {
    return res.status(404).json({ error: 'Équipe introuvable' });
  }
  if (team.captain_id !== actor.authUserId) {
    return res
      .status(403)
      .json({ error: 'Action réservée au capitaine de cette équipe.' });
  }

  const targetDiscordUserId =
    typeof body.targetDiscordUserId === 'string'
      ? body.targetDiscordUserId.trim()
      : '';
  if (!DISCORD_ID_RE.test(targetDiscordUserId)) {
    return res.status(400).json({ error: 'targetDiscordUserId requis' });
  }
  if (targetDiscordUserId === actor.discordUserId) {
    return res
      .status(400)
      .json({ error: 'Tu fais déjà partie de cette équipe.' });
  }

  const target = await resolveActorPlayer(targetDiscordUserId);
  if (!target) {
    return res.status(404).json({
      error:
        "La joueuse ciblée n'a pas lié son compte Discord au site. Elle doit lancer /inscription d'abord.",
    });
  }

  const comment =
    typeof body.comment === 'string' ? body.comment.trim().slice(0, COMMENT_MAX) : null;
  const role = typeof body.role === 'string' ? body.role : undefined;
  const battleTag =
    typeof body.battleTag === 'string' ? body.battleTag : undefined;

  const result = await createInvitation(req.botContext!.tenantId, {
    teamId: team.id,
    captainAuthUserId: actor.authUserId,
    captainDiscordUserId: actor.discordUserId,
    inviteeAuthUserId: target.authUserId,
    inviteeDiscordUserId: targetDiscordUserId,
    role,
    battleTag,
    comment,
  });
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  void logPlayerAction({
    actorAuthUserId: actor.authUserId,
    actorDiscordUserId: actor.discordUserId,
    action: 'invite_create',
    entityType: 'invitation',
    entityId: result.data.id,
    targetAuthUserId: target.authUserId,
    targetDiscordUserId: targetDiscordUserId,
    payload: { team_id: team.id, role, has_comment: !!comment },
  });

  return res.status(201).json({
    success: true,
    invitation: result.data,
    teamName: team.name,
  });
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.teamId;
  const teamId = Array.isArray(raw) ? raw[0] : raw;
  if (!teamId || !isValidUUID(teamId)) {
    return res.status(400).json({ error: 'teamId invalide' });
  }

  if (req.method === 'GET') return handleList(req, res, teamId);
  if (req.method === 'POST') return handleCreate(req, res, teamId);

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withBotRoute(handler, {
  methods: ['GET', 'POST'],
  rateLimit: { max: 60, key: 'bot-team-invitations' },
  idempotent: true,
});
