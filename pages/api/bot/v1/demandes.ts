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
import { oneRelation, type Relation } from '@/utils/supabase/relation';

/**
 * LA FORME DE LA LECTURE, DÉCLARÉE UNE FOIS — elle recopie exactement le
 * `.select()` plus bas.
 *
 * `payload` RESTE LIBRE, et c'est délibéré : c'est une colonne JSONB dont le
 * contenu dépend du `type` de la demande (transfert, scrim, inscription…).
 * Lui inventer une forme unique ferait mentir la déclaration ; les lecteurs en
 * extraient les champs qu'ils connaissent, à leurs risques.
 */
type TeamRel = {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
};
type TournamentRel = { id: string; name: string; slug: string | null };

type DemandeRow = {
  id: string;
  user_id: string | null;
  team_id: string | null;
  tournament_id: string | null;
  type: string;
  status: string;
  comment: string | null;
  source: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  processed_at: string | null;
  team: Relation<TeamRel>;
  tournament: Relation<TournamentRel>;
};

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

  const demandes = ((data ?? []) as DemandeRow[]).map((row) => {
    const team = oneRelation(row.team);
    const tournament = oneRelation(row.tournament);
    const payload = row.payload ?? null;

    return {
      id: row.id,
      type: row.type,
      status: row.status,
      source: row.source ?? null,
      comment: row.comment ?? null,
      createdAt: row.created_at,
      processedAt: row.processed_at ?? null,
      userId: row.user_id ?? null,
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
