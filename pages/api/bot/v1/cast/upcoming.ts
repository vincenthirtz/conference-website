// GET /api/bot/v1/cast/upcoming
//
// Liste les cast_assignments dont le match commence dans [now, now+withinMinutes]
// et qui n'ont pas encore ete acquittes (acked_at IS NULL). Sert au bot pour
// DM les casters a T-30 avec un bouton "Je confirme" (qui POST /cast/:id/ack).
//
// Query :
//   - withinMinutes : 5..120, defaut 30
//
// Auth : x-api-key (lecture bot).
//
// Note : on filtre aussi sur le statut du match (pas de matchs annules) — on
// ne renvoie que des assignations actionnables. Les matches.is_bye sont aussi
// exclus puisqu'ils n'ont pas de cast.
//
// EXCEPTION DE SCOPING TENANT_ID : meme philosophie que /events/pending et
// /tenants/all-configs — le bot est multi-tenant et doit poller une seule
// fois pour DM les casters de tous les guilds. Chaque row expose son
// `tenantId` afin que le bot route correctement (resolution
// `tenantId -> guildId` cote tenant_config). Pas de filtre `tenant_id`
// applique dans le SELECT.

import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotCrossTenantRequest } from '@/utils/botAuth';
import { logger } from '@/utils/logger';

const MIN_WITHIN = 5;
const MAX_WITHIN = 120;
const DEFAULT_WITHIN = 30;

// Statuts de match exclus : annule/forfait/finished -> pas de cast a venir
const EXCLUDED_MATCH_STATUSES = new Set([
  'cancelled',
  'canceled',
  'finished',
  'forfeit',
]);

async function handler(req: BotCrossTenantRequest, res: NextApiResponse) {
  const rawWithin = Number(req.query.withinMinutes);
  if (
    req.query.withinMinutes !== undefined &&
    (!Number.isFinite(rawWithin) ||
      rawWithin < MIN_WITHIN ||
      rawWithin > MAX_WITHIN)
  ) {
    return res.status(400).json({
      error: `withinMinutes doit etre un nombre entre ${MIN_WITHIN} et ${MAX_WITHIN}.`,
    });
  }
  const withinMinutes = Number.isFinite(rawWithin)
    ? Math.max(MIN_WITHIN, Math.min(MAX_WITHIN, Math.floor(rawWithin)))
    : DEFAULT_WITHIN;

  const now = new Date();
  const windowEnd = new Date(now.getTime() + withinMinutes * 60_000);

  // On filtre sur matches.scheduled_at (le match commence dans la fenetre),
  // pas sur briefing_at. Le brief T-30 est cale par convention sur 30min
  // avant scheduled_at cote admin, mais c'est le match qui fait foi pour le
  // "upcoming".
  // crossTenant: true — pas de filtre `tenant_id`. Le bot va router via le
  // `tenantId` retourne par row (cf. note d'en-tete).
  // Lot 9 : cast_assignments est polymorphe (match_id XOR scrim_id). On
  // requete les deux variantes en parallele puis on merge.
  const [matchRes, scrimRes] = await Promise.all([
    supabaseAdmin
      .from('cast_assignments')
      .select(
        `id, tenant_id, match_id, briefing_at, acked_at, cast_member_id,
         cast_member:cast_member_id (id, name, title, auth_user_id),
         match:match_id (
           id, status, scheduled_at, is_bye,
           team1:team1_id (id, name, short_name),
           team2:team2_id (id, name, short_name),
           tournament:tournament_id (id, name, slug)
         )`
      )
      .is('acked_at', null)
      .not('match_id', 'is', null)
      .order('briefing_at', { ascending: true }),
    supabaseAdmin
      .from('cast_assignments')
      .select(
        `id, tenant_id, scrim_id, briefing_at, acked_at, cast_member_id,
         cast_member:cast_member_id (id, name, title, auth_user_id),
         scrim:scrim_id (
           id, name, slug, status, scheduled_date, stream_url,
           team1:team1_id (id, name, short_name),
           team2:team2_id (id, name, short_name)
         )`
      )
      .is('acked_at', null)
      .not('scrim_id', 'is', null)
      .order('briefing_at', { ascending: true }),
  ]);

  if (matchRes.error) {
    logger.error('[bot/cast/upcoming] match query error', matchRes.error);
    return res.status(500).json({ error: 'Erreur de lecture' });
  }
  if (scrimRes.error) {
    logger.error('[bot/cast/upcoming] scrim query error', scrimRes.error);
  }

  const matchRows = (matchRes.data ?? []).filter((row) => {
    const r = row as Record<string, unknown>;
    const matchRel = r.match;
    const m = Array.isArray(matchRel)
      ? (matchRel[0] as Record<string, unknown> | undefined)
      : (matchRel as Record<string, unknown> | null | undefined);
    if (!m) return false;
    if (m.is_bye === true) return false;
    const status = typeof m.status === 'string' ? m.status : '';
    if (EXCLUDED_MATCH_STATUSES.has(status)) return false;
    const startsAt = m.scheduled_at;
    if (typeof startsAt !== 'string') return false;
    const ts = Date.parse(startsAt);
    if (!Number.isFinite(ts)) return false;
    return ts >= now.getTime() && ts <= windowEnd.getTime();
  });

  const scrimRows = (scrimRes.data ?? []).filter((row) => {
    const r = row as Record<string, unknown>;
    const scrimRel = r.scrim;
    const s = Array.isArray(scrimRel)
      ? (scrimRel[0] as Record<string, unknown> | undefined)
      : (scrimRel as Record<string, unknown> | null | undefined);
    if (!s) return false;
    const status = typeof s.status === 'string' ? s.status : '';
    if (status === 'cancelled') return false;
    const startsAt = s.scheduled_date;
    if (typeof startsAt !== 'string') return false;
    const ts = Date.parse(startsAt);
    if (!Number.isFinite(ts)) return false;
    return ts >= now.getTime() && ts <= windowEnd.getTime();
  });

  const rows = [...matchRows, ...scrimRows];

  // Batch resolve discord_user_id pour chaque caster.
  const authIds = rows
    .map((r) => {
      const cmRel = (r as Record<string, unknown>).cast_member;
      const cm = Array.isArray(cmRel)
        ? (cmRel[0] as Record<string, unknown> | undefined)
        : (cmRel as Record<string, unknown> | null | undefined);
      const aid = cm?.auth_user_id;
      return typeof aid === 'string' ? aid : null;
    })
    .filter((x): x is string => !!x);
  let discordByAuth = new Map<string, string>();
  if (authIds.length > 0) {
    const { data: links } = await supabaseAdmin
      .from('user_discord_links')
      .select('auth_user_id, discord_user_id')
      .in('auth_user_id', authIds);
    discordByAuth = new Map(
      (links ?? []).map((l) => {
        const link = l as { auth_user_id: string; discord_user_id: string };
        return [link.auth_user_id, link.discord_user_id];
      })
    );
  }

  const assignments = rows.map((row) => {
    const r = row as Record<string, unknown>;
    const cmRel = r.cast_member;
    const cm = (Array.isArray(cmRel) ? cmRel[0] : cmRel) as
      | Record<string, unknown>
      | null
      | undefined;

    const matchRel = r.match;
    const m = (Array.isArray(matchRel) ? matchRel[0] : matchRel) as
      | Record<string, unknown>
      | null
      | undefined;
    const scrimRel = r.scrim;
    const s = (Array.isArray(scrimRel) ? scrimRel[0] : scrimRel) as
      | Record<string, unknown>
      | null
      | undefined;

    const isMatch = !!m;
    const entity = isMatch ? m : s;
    const t1Rel = entity?.team1;
    const t2Rel = entity?.team2;
    const tnRel = m?.tournament; // scrims n'ont pas de tournament FK
    const t1 = (Array.isArray(t1Rel) ? t1Rel[0] : t1Rel) as
      | Record<string, unknown>
      | null
      | undefined;
    const t2 = (Array.isArray(t2Rel) ? t2Rel[0] : t2Rel) as
      | Record<string, unknown>
      | null
      | undefined;
    const tn = (Array.isArray(tnRel) ? tnRel[0] : tnRel) as
      | Record<string, unknown>
      | null
      | undefined;
    const casterAuth =
      cm && typeof cm.auth_user_id === 'string' ? cm.auth_user_id : null;
    const casterDiscord = casterAuth
      ? (discordByAuth.get(casterAuth) ?? null)
      : null;
    return {
      assignmentId: r.id as string,
      tenantId: (r.tenant_id as string | null) ?? null,
      kind: isMatch ? ('match' as const) : ('scrim' as const),
      // Backward-compat : matchId reste rempli quand kind='match'.
      matchId: isMatch ? (r.match_id as string) : null,
      scrimId: isMatch ? null : (r.scrim_id as string),
      matchStartsAt: isMatch
        ? ((m?.scheduled_at as string | null) ?? null)
        : ((s?.scheduled_date as string | null) ?? null),
      casterDiscordUserId: casterDiscord,
      role: (cm?.title as string | null) ?? null,
      teamA: t1
        ? { id: t1.id as string, name: (t1.name as string | null) ?? null }
        : null,
      teamB: t2
        ? { id: t2.id as string, name: (t2.name as string | null) ?? null }
        : null,
      tournamentName: (tn?.name as string | null) ?? null,
      scrimName: isMatch ? null : ((s?.name as string | null) ?? null),
      ackedAt: (r.acked_at as string | null) ?? null,
    };
  });

  return res.status(200).json({
    assignments,
    count: assignments.length,
    withinMinutes,
  });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 60, key: 'bot-cast-upcoming' },
  crossTenant: true,
});
