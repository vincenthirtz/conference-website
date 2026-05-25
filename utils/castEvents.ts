// utils/castEvents.ts
//
// Helper d'emit des bot events pour les cast assignments. Résout cast_member
// + match (teams + tournament/scrim/stage) afin que le bot puisse :
//   - DM immédiat au caster (via auth_user_id → user_discord_links)
//   - Reprogrammer son reminder interne sans repasser par /cast/assignments
//   - Mettre à jour l'embed du thread Discord du match
//
// Reste tolérant aux résolutions manquantes : les emits sont best-effort et
// ne doivent jamais faire échouer la route HTTP appelante.

import { supabaseAdmin } from './supabase';
import { logger } from './logger';
import { emitBotEvent, type BotEventName } from './botEvents';

type CastEventName = Extract<BotEventName, `cast.${string}`>;

type CastMemberLite = {
  id: string;
  name: string;
  authUserId: string | null;
  discordUserId: string | null;
  discordUsername: string | null;
  imageUrl: string | null;
};

type TeamLite = {
  id: string;
  name: string;
  shortName: string | null;
};

type MatchSnapshot = {
  id: string;
  scheduledAt: string | null;
  status: string | null;
  team1: TeamLite | null;
  team2: TeamLite | null;
  tournament: { id: string; name: string } | null;
  stage: { id: string; name: string } | null;
  scrim: { id: string; name: string; slug: string } | null;
};

async function resolveCastMember(
  castMemberId: string
): Promise<CastMemberLite | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('cast_members')
    .select('id, name, auth_user_id, image_url')
    .eq('id', castMemberId)
    .maybeSingle();
  if (error) {
    logger.error('[castEvents] resolveCastMember error', error);
    return null;
  }
  if (!data) return null;

  const authUserId = (data.auth_user_id as string | null) ?? null;

  // Résout discord_user_id si le caster a lié son compte. Sans ce join le
  // bot devrait round-tripper l'API pour DM le caster — autant lui donner
  // tout le contexte dans le payload.
  let discordUserId: string | null = null;
  let discordUsername: string | null = null;
  if (authUserId) {
    const { data: link, error: linkErr } = await supabaseAdmin
      .from('user_discord_links')
      .select('discord_user_id, discord_username')
      .eq('auth_user_id', authUserId)
      .maybeSingle();
    if (linkErr) {
      logger.error('[castEvents] discord link error', linkErr);
    } else if (link) {
      discordUserId = (link.discord_user_id as string | null) ?? null;
      discordUsername = (link.discord_username as string | null) ?? null;
    }
  }

  return {
    id: data.id as string,
    name: data.name as string,
    authUserId,
    discordUserId,
    discordUsername,
    imageUrl: (data.image_url as string | null) ?? null,
  };
}

async function resolveMatch(matchId: string): Promise<MatchSnapshot | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('matches')
    .select(
      `id, scheduled_at, status,
       team1_id, team2_id, tournament_id, stage_id, scrim_id,
       team1:teams!matches_team1_id_fkey(id, name, short_name),
       team2:teams!matches_team2_id_fkey(id, name, short_name),
       tournament:tournaments(id, name),
       stage:tournament_stages(id, name),
       scrim:scrims(id, name, slug)`
    )
    .eq('id', matchId)
    .maybeSingle();
  if (error) {
    logger.error('[castEvents] resolveMatch error', error);
    return null;
  }
  if (!data) return null;

  const team1 = (data as any).team1 as
    | { id: string; name: string; short_name: string | null }
    | null;
  const team2 = (data as any).team2 as
    | { id: string; name: string; short_name: string | null }
    | null;
  const tournament = (data as any).tournament as
    | { id: string; name: string }
    | null;
  const stage = (data as any).stage as { id: string; name: string } | null;
  const scrim = (data as any).scrim as
    | { id: string; name: string; slug: string }
    | null;

  return {
    id: data.id as string,
    scheduledAt: (data.scheduled_at as string | null) ?? null,
    status: (data.status as string | null) ?? null,
    team1: team1
      ? { id: team1.id, name: team1.name, shortName: team1.short_name }
      : null,
    team2: team2
      ? { id: team2.id, name: team2.name, shortName: team2.short_name }
      : null,
    tournament: tournament ? { id: tournament.id, name: tournament.name } : null,
    stage: stage ? { id: stage.id, name: stage.name } : null,
    scrim: scrim
      ? { id: scrim.id, name: scrim.name, slug: scrim.slug }
      : null,
  };
}

type AssignmentInput = {
  assignmentId: string;
  /** Lot 9 : matchId XOR scrimId (cast_assignments polymorphique). */
  matchId?: string | null;
  scrimId?: string | null;
  castMemberId: string;
  briefingAt: string | null;
};

/**
 * Émet un bot event cast.* avec un payload normalisé.
 *
 * Appel non-bloquant côté caller : utilise `void emitCastEvent(...)`. Toute
 * erreur est loggée en interne et n'affecte pas la réponse HTTP.
 */
export async function emitCastEvent(
  eventName: CastEventName,
  assignment: AssignmentInput,
  tenantId: string,
  extras?: Record<string, unknown>
): Promise<void> {
  try {
    if (!tenantId) {
      logger.error(
        `[castEvents] ${eventName} aborted: tenantId missing — multi-tenant required`
      );
      return;
    }
    const matchId = assignment.matchId ?? null;
    const scrimId = assignment.scrimId ?? null;
    const [castMember, match] = await Promise.all([
      resolveCastMember(assignment.castMemberId),
      matchId ? resolveMatch(matchId) : Promise.resolve(null),
    ]);

    await emitBotEvent(
      eventName,
      {
        assignmentId: assignment.assignmentId,
        // Lot 9 : on garde matchId/scrimId nuls explicites pour signaler la
        // kind au bot consumer.
        matchId,
        scrimId,
        castMemberId: assignment.castMemberId,
        briefingAt: assignment.briefingAt,
        castMember,
        match,
        ...(extras ?? {}),
      },
      tenantId
    );
  } catch (err) {
    logger.error(`[castEvents] emit ${eventName} failed`, err);
  }
}
