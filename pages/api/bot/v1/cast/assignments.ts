// GET /api/bot/v1/cast/assignments
//
// Commande /casters /lives : liste les assignments a venir (par defaut dans
// les 48h, filtrable par tournament et by-caster).
//
// Query :
//   - tournament    : UUID, filtre par tournoi
//   - castMemberId  : UUID, filtre par caster
//   - hours         : fenetre en heures, defaut 48, max 720 (30j)
//   - includePast   : '1' ou 'true' pour inclure les briefings deja passes
//   - limit         : 1..100, defaut 25
//
// Auth : x-api-key (lecture publique).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;
const MAX_HOURS = 720;

function queryString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const rawLimit = Number(req.query.limit);
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const rawHours = Number(req.query.hours);
  const hours =
    Number.isFinite(rawHours) && rawHours > 0
      ? Math.min(rawHours, MAX_HOURS)
      : 48;

  const tournamentId = queryString(req.query.tournament);
  if (tournamentId && !isValidUUID(tournamentId)) {
    return res.status(400).json({ error: 'tournament invalide' });
  }

  const castMemberId = queryString(req.query.castMemberId);
  if (castMemberId && !isValidUUID(castMemberId)) {
    return res.status(400).json({ error: 'castMemberId invalide' });
  }

  const includePast =
    req.query.includePast === '1' || req.query.includePast === 'true';

  const now = new Date();
  const windowEnd = new Date(now.getTime() + hours * 60 * 60_000);

  let query = supabaseAdmin
    .from('cast_assignments')
    .select(
      `id, match_id, briefing_at, briefing_reminder_sent_at, cast_member_id,
       cast_member:cast_member_id (id, name, auth_user_id, image_url),
       match:match_id (
         id, status, scheduled_at, stream_url, round_name, round_number,
         tournament_id,
         team1:team1_id (id, name, short_name),
         team2:team2_id (id, name, short_name),
         tournament:tournament_id (id, name, slug)
       )`
    )
    .eq('tenant_id', req.botContext!.tenantId)
    .order('briefing_at', { ascending: true })
    .limit(limit);

  if (!includePast) {
    query = query.gte('briefing_at', now.toISOString());
  }
  query = query.lte('briefing_at', windowEnd.toISOString());
  if (castMemberId) query = query.eq('cast_member_id', castMemberId);

  const { data, error } = await query;
  if (error) {
    logger.error('[bot/cast/assignments] query error', error);
    return res.status(500).json({ error: 'Erreur de lecture' });
  }

  // Filtre par tournoi cote app (jointure indirecte via match.tournament_id).
  let rows = data ?? [];
  if (tournamentId) {
    rows = rows.filter((r) => {
      const matchRel = Array.isArray((r as any).match)
        ? (r as any).match[0]
        : (r as any).match;
      return matchRel?.tournament_id === tournamentId;
    });
  }

  // Enrichir avec discordUserId du caster (batch)
  const authIds = rows
    .map((r) => {
      const cm = Array.isArray((r as any).cast_member)
        ? (r as any).cast_member[0]
        : (r as any).cast_member;
      return cm?.auth_user_id as string | undefined;
    })
    .filter((x): x is string => !!x);
  let discordByAuth = new Map<string, string>();
  if (authIds.length > 0) {
    const { data: links } = await supabaseAdmin
      .from('user_discord_links')
      .select('auth_user_id, discord_user_id')
      .in('auth_user_id', authIds);
    discordByAuth = new Map(
      (links ?? []).map((l) => [
        (l as any).auth_user_id,
        (l as any).discord_user_id,
      ])
    );
  }

  const assignments = rows.map((r) => {
    const cm = Array.isArray((r as any).cast_member)
      ? (r as any).cast_member[0]
      : (r as any).cast_member;
    const matchRel = Array.isArray((r as any).match)
      ? (r as any).match[0]
      : (r as any).match;
    const t1 = Array.isArray(matchRel?.team1)
      ? matchRel.team1[0]
      : matchRel?.team1;
    const t2 = Array.isArray(matchRel?.team2)
      ? matchRel.team2[0]
      : matchRel?.team2;
    const tn = Array.isArray(matchRel?.tournament)
      ? matchRel.tournament[0]
      : matchRel?.tournament;

    return {
      id: (r as any).id,
      briefingAt: (r as any).briefing_at,
      briefingReminderSentAt: (r as any).briefing_reminder_sent_at,
      castMember: cm
        ? {
            id: cm.id,
            name: cm.name ?? null,
            authUserId: cm.auth_user_id ?? null,
            discordUserId: cm.auth_user_id
              ? discordByAuth.get(cm.auth_user_id) ?? null
              : null,
          }
        : null,
      match: matchRel
        ? {
            id: matchRel.id,
            status: matchRel.status,
            scheduledAt: matchRel.scheduled_at ?? null,
            streamUrl: matchRel.stream_url ?? null,
            round: matchRel.round_name ?? null,
            roundNumber: matchRel.round_number ?? null,
            team1: t1 ? { id: t1.id, name: t1.name } : null,
            team2: t2 ? { id: t2.id, name: t2.name } : null,
            tournament: tn ? { id: tn.id, name: tn.name, slug: tn.slug } : null,
          }
        : null,
    };
  });

  return res
    .status(200)
    .json({ assignments, count: assignments.length, hours });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 30, key: 'bot-cast-assignments' },
});
