// GET /api/bot/v1/demandes
//
// Commande /demandes (admin) : pile des demandes en cours (join, transfer,
// captain_request, invite, etc.).
//
// Query params :
//   - status     : defaut 'pending'. Accepte 'pending' | 'approved'
//                  | 'rejected' | 'cancelled' | 'all'
//   - type       : filtre exact sur la colonne type
//   - limit      : 1..100, defaut 25
//   - tournament : UUID, filtre les demandes liees a ce tournoi
//
// Auth : x-api-key + actorDiscordUserId staff admin/owner.

import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { requireBotStaff } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const VALID_STATUSES = new Set([
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'all',
]);

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

function queryString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const actorDiscordUserId =
    queryString(req.query.actorDiscordUserId) ??
    queryString(
      (req.body as Record<string, unknown> | null)?.actorDiscordUserId
    );
  const actor = await requireBotStaff(req, res, {
    actorDiscordUserId: actorDiscordUserId ?? '',
  });
  if (!actor) return;

  const status = queryString(req.query.status)?.toLowerCase() ?? 'pending';
  if (!VALID_STATUSES.has(status)) {
    return res.status(400).json({
      error: `status invalide. Valeurs : ${[...VALID_STATUSES].join(', ')}.`,
    });
  }

  const type = queryString(req.query.type);
  const tournamentId = queryString(req.query.tournament);
  if (tournamentId && !isValidUUID(tournamentId)) {
    return res.status(400).json({ error: 'tournament invalide' });
  }

  const rawLimit = Number(req.query.limit);
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  let query = supabaseAdmin
    .from('demandes')
    .select(
      `id, user_id, team_id, tournament_id, type, status, comment, source,
       payload, created_at, processed_at,
       team:teams!team_id(id, name, slug, logo_url),
       tournament:tournaments!tournament_id(id, name, slug)`
    )
    .eq('tenant_id', req.botContext.tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status !== 'all') query = query.eq('status', status);
  if (type) query = query.eq('type', type);
  if (tournamentId) query = query.eq('tournament_id', tournamentId);

  const { data, error } = await query;
  if (error) {
    logger.error('[bot/demandes] query error', error);
    return res.status(500).json({ error: 'Erreur de lecture des demandes' });
  }

  const demandes = (data ?? []).map((row) => {
    const team = Array.isArray((row as any).team)
      ? (row as any).team[0]
      : (row as any).team;
    const tournament = Array.isArray((row as any).tournament)
      ? (row as any).tournament[0]
      : (row as any).tournament;
    const payload = (row as any).payload ?? null;

    return {
      id: (row as any).id,
      type: (row as any).type,
      status: (row as any).status,
      source: (row as any).source ?? null,
      comment: (row as any).comment ?? null,
      createdAt: (row as any).created_at,
      processedAt: (row as any).processed_at ?? null,
      userId: (row as any).user_id ?? null,
      team: team
        ? {
            id: team.id,
            name: team.name,
            slug: team.slug ?? null,
            logoUrl: team.logo_url ?? null,
          }
        : null,
      tournament: tournament
        ? {
            id: tournament.id,
            name: tournament.name,
            slug: tournament.slug ?? null,
          }
        : null,
      // payload public-safe : on garde des cles utiles cote bot (capitaine
      // emetteur d'invite, role souhaite, etc.) sans exposer d'info sensible.
      meta: payload
        ? {
            desiredRole: payload.desired_role ?? null,
            captainDiscordUserId: payload.captain_discord_user_id ?? null,
            inviteeDiscordUserId: payload.invitee_discord_user_id ?? null,
            expiresAt: payload.expires_at ?? null,
          }
        : null,
    };
  });

  return res.status(200).json({ demandes, count: demandes.length });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 30, key: 'bot-demandes' },
});
