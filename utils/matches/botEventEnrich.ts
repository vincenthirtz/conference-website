// utils/matches/botEventEnrich.ts
//
// Enrichit les payloads des events match.* sortants vers le bot Discord.
//
// Le bot a besoin pour ses chantiers Discord-natifs (threads de match,
// scheduled events, embeds enrichis avec avatar capitaine, forum disputes)
// d'infos qui ne sont pas dans la table matches : noms d'equipes, logos,
// roles Discord, discordUserId du capitaine pour la thumbnail. Plutot que
// d'imposer 3-4 round-trips au bot, on enrichit cote site en un seul fetch.
//
// Echec silencieux : si le fetch d'enrichissement rate, on renvoie le payload
// minimal (matchId + ce qu'on a). Le bot saura le gerer (il refetchait deja).

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';

type EnrichedTeam = {
  id: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  discordRoleId: string | null;
  discordChannelId: string | null;
  discordVoiceChannelId: string | null;
  captainDiscordUserId: string | null;
};

export type EnrichedMatchEvent = {
  matchId: string;
  tournamentId: string | null;
  tournamentName: string | null;
  scrimId: string | null;
  scrimName: string | null;
  stageId: string | null;
  roundName: string | null;
  matchFormat: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  status: string | null;
  team1Score: number | null;
  team2Score: number | null;
  lobbyCode: string | null;
  streamUrl: string | null;
  team1: EnrichedTeam | null;
  team2: EnrichedTeam | null;
  discordThreadId: string | null;
  discordScheduledEventId: string | null;
  discordDisputeThreadId: string | null;
};

async function fetchCaptainDiscordUserId(
  captainAuthId: string | null
): Promise<string | null> {
  if (!captainAuthId || !supabaseAdmin) return null;
  const { data } = await supabaseAdmin
    .from('user_discord_links')
    .select('discord_user_id')
    .eq('user_id', captainAuthId)
    .maybeSingle();
  return (data?.discord_user_id as string | undefined) ?? null;
}

export async function enrichMatchEvent(
  matchId: string
): Promise<EnrichedMatchEvent | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data: m } = await supabaseAdmin
      .from('matches')
      .select(
        `
        id,
        tournament_id,
        scrim_id,
        stage_id,
        round_name,
        match_format,
        scheduled_at,
        started_at,
        status,
        team1_score,
        team2_score,
        lobby_code,
        stream_url,
        discord_thread_id,
        discord_scheduled_event_id,
        discord_dispute_thread_id,
        team1:team1_id(id, name, short_name, logo_url, discord_role_id, discord_channel_id, discord_voice_channel_id, captain_id),
        team2:team2_id(id, name, short_name, logo_url, discord_role_id, discord_channel_id, discord_voice_channel_id, captain_id),
        tournament:tournament_id(id, name),
        scrim:scrim_id(id, name)
        `
      )
      .eq('id', matchId)
      .maybeSingle();

    if (!m) return null;

    const t1Raw = Array.isArray(m.team1) ? m.team1[0] : m.team1;
    const t2Raw = Array.isArray(m.team2) ? m.team2[0] : m.team2;
    const tnRaw = Array.isArray(m.tournament) ? m.tournament[0] : m.tournament;
    const scRaw = Array.isArray(m.scrim) ? m.scrim[0] : m.scrim;

    const [t1Captain, t2Captain] = await Promise.all([
      fetchCaptainDiscordUserId(t1Raw?.captain_id ?? null),
      fetchCaptainDiscordUserId(t2Raw?.captain_id ?? null),
    ]);

    const team1 = t1Raw
      ? {
          id: t1Raw.id,
          name: t1Raw.name,
          shortName: t1Raw.short_name ?? null,
          logoUrl: t1Raw.logo_url ?? null,
          discordRoleId: t1Raw.discord_role_id ?? null,
          discordChannelId: t1Raw.discord_channel_id ?? null,
          discordVoiceChannelId: t1Raw.discord_voice_channel_id ?? null,
          captainDiscordUserId: t1Captain,
        }
      : null;
    const team2 = t2Raw
      ? {
          id: t2Raw.id,
          name: t2Raw.name,
          shortName: t2Raw.short_name ?? null,
          logoUrl: t2Raw.logo_url ?? null,
          discordRoleId: t2Raw.discord_role_id ?? null,
          discordChannelId: t2Raw.discord_channel_id ?? null,
          discordVoiceChannelId: t2Raw.discord_voice_channel_id ?? null,
          captainDiscordUserId: t2Captain,
        }
      : null;

    return {
      matchId: m.id,
      tournamentId: m.tournament_id ?? null,
      tournamentName: tnRaw?.name ?? null,
      scrimId: m.scrim_id ?? null,
      scrimName: scRaw?.name ?? null,
      stageId: m.stage_id ?? null,
      roundName: m.round_name ?? null,
      matchFormat: m.match_format ?? null,
      scheduledAt: m.scheduled_at ?? null,
      startedAt: m.started_at ?? null,
      status: m.status ?? null,
      team1Score: m.team1_score ?? null,
      team2Score: m.team2_score ?? null,
      lobbyCode: m.lobby_code ?? null,
      streamUrl: m.stream_url ?? null,
      team1,
      team2,
      discordThreadId: m.discord_thread_id ?? null,
      discordScheduledEventId: m.discord_scheduled_event_id ?? null,
      discordDisputeThreadId: m.discord_dispute_thread_id ?? null,
    };
  } catch (err) {
    logger.error('[botEventEnrich] fetch error', err);
    return null;
  }
}
