// Tests pour utils/matches/botEventEnrich.ts
//
// enrichMatchEvent() est appele par tous les emit sites des events match.*
// pour eviter au bot un round-trip API. La forme du payload importe : si on
// casse une cle (renommage `discordRoleId` -> `discord_role_id` par ex), les
// chantiers Discord-natifs (threads, vocaux, forum disputes) tombent en
// silence cote bot.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { store, resetSupabaseMock } from './__helpers__/supabaseMock';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { enrichMatchEvent } from '../../utils/matches/botEventEnrich';

beforeEach(() => {
  resetSupabaseMock();
});

const TEAM_1 = {
  id: 'team-1',
  name: 'Alpha',
  short_name: 'ALP',
  logo_url: 'https://logo/alpha.png',
  discord_role_id: '111111111111111111',
  discord_channel_id: '222222222222222222',
  discord_voice_channel_id: '333333333333333333',
  captain_id: 'auth-cap1',
};
const TEAM_2 = {
  id: 'team-2',
  name: 'Bravo',
  short_name: 'BRV',
  logo_url: null,
  discord_role_id: '444444444444444444',
  discord_channel_id: null,
  discord_voice_channel_id: null,
  captain_id: 'auth-cap2',
};

describe('enrichMatchEvent', () => {
  it('renvoie le payload complet aplati pour un match standard', async () => {
    store.matches = [
      {
        id: 'match-1',
        tournament_id: 'tour-1',
        scrim_id: null,
        stage_id: 'stage-1',
        round_name: 'Quart de finale',
        match_format: 'BO5',
        scheduled_at: '2026-06-01T19:00:00Z',
        started_at: null,
        status: 'pending',
        team1_score: 0,
        team2_score: 0,
        lobby_code: 'ABCD1234',
        stream_url: 'https://twitch.tv/alpha',
        discord_thread_id: '999000000000000000',
        discord_scheduled_event_id: null,
        discord_dispute_thread_id: null,
        discord_match_channel_id: '888000000000000000',
        team1: TEAM_1,
        team2: TEAM_2,
        tournament: { id: 'tour-1', name: 'Spring Cup' },
      },
    ];
    // Colonne `auth_user_id` — la fixture disait `user_id`, ce qui « marchait »
    // seulement parce que le code filtrait sur la même colonne inexistante
    // (bug corrigé le 2026-08-20 ; cf. discordLinksColumnGuard.test.ts).
    store.user_discord_links = [
      { auth_user_id: 'auth-cap1', discord_user_id: '500000000000000001' },
      { auth_user_id: 'auth-cap2', discord_user_id: '500000000000000002' },
    ];

    const enriched = await enrichMatchEvent('match-1');

    expect(enriched).not.toBeNull();
    expect(enriched).toMatchObject({
      matchId: 'match-1',
      tournamentId: 'tour-1',
      tournamentName: 'Spring Cup',
      scrimId: null,
      scrimName: null,
      stageId: 'stage-1',
      roundName: 'Quart de finale',
      matchFormat: 'BO5',
      scheduledAt: '2026-06-01T19:00:00Z',
      status: 'pending',
      lobbyCode: 'ABCD1234',
      streamUrl: 'https://twitch.tv/alpha',
      discordThreadId: '999000000000000000',
      discordScheduledEventId: null,
      discordDisputeThreadId: null,
      discordMatchChannelId: '888000000000000000',
    });
    expect(enriched!.team1).toEqual({
      id: 'team-1',
      name: 'Alpha',
      shortName: 'ALP',
      logoUrl: 'https://logo/alpha.png',
      discordRoleId: '111111111111111111',
      discordChannelId: '222222222222222222',
      discordVoiceChannelId: '333333333333333333',
      captainDiscordUserId: '500000000000000001',
    });
    expect(enriched!.team2).toEqual({
      id: 'team-2',
      name: 'Bravo',
      shortName: 'BRV',
      logoUrl: null,
      discordRoleId: '444444444444444444',
      discordChannelId: null,
      discordVoiceChannelId: null,
      captainDiscordUserId: '500000000000000002',
    });
  });

  it("renvoie null quand le match n'existe pas", async () => {
    store.matches = [];
    const enriched = await enrichMatchEvent('inexistant');
    expect(enriched).toBeNull();
  });

  it('tolere une equipe (BYE) ou un capitaine sans lien Discord', async () => {
    store.matches = [
      {
        id: 'match-bye',
        tournament_id: null,
        scrim_id: null,
        stage_id: null,
        round_name: null,
        match_format: null,
        scheduled_at: null,
        started_at: null,
        status: 'pending',
        team1_score: 0,
        team2_score: 0,
        lobby_code: null,
        stream_url: null,
        discord_thread_id: null,
        discord_scheduled_event_id: null,
        discord_dispute_thread_id: null,
        team1: { ...TEAM_1, captain_id: 'auth-orphan' },
        team2: null,
        tournament: null,
      },
    ];
    store.user_discord_links = []; // capitaine non lie

    const enriched = await enrichMatchEvent('match-bye');
    expect(enriched).not.toBeNull();
    expect(enriched!.team2).toBeNull();
    expect(enriched!.team1!.captainDiscordUserId).toBeNull();
    expect(enriched!.tournamentName).toBeNull();
    // Degradation gracieuse (T4) : la row ne porte pas la colonne
    // discord_match_channel_id -> le champ tombe a null sans casser l'enrich.
    expect(enriched!.discordMatchChannelId).toBeNull();
  });

  it('renvoie scrimName et tournamentName=null pour un match de scrim', async () => {
    store.matches = [
      {
        id: 'match-scrim',
        tournament_id: null,
        scrim_id: 'scrim-1',
        stage_id: null,
        round_name: null,
        match_format: 'BO3',
        scheduled_at: '2026-06-02T20:00:00Z',
        started_at: null,
        status: 'pending',
        team1_score: 0,
        team2_score: 0,
        lobby_code: null,
        stream_url: null,
        discord_thread_id: null,
        discord_scheduled_event_id: null,
        discord_dispute_thread_id: null,
        team1: TEAM_1,
        team2: TEAM_2,
        tournament: null,
        scrim: { id: 'scrim-1', name: 'Pulse vs Echo - Scrim Tactical' },
      },
    ];
    store.user_discord_links = [];

    const enriched = await enrichMatchEvent('match-scrim');
    expect(enriched).not.toBeNull();
    expect(enriched!.tournamentId).toBeNull();
    expect(enriched!.tournamentName).toBeNull();
    expect(enriched!.scrimId).toBe('scrim-1');
    expect(enriched!.scrimName).toBe('Pulse vs Echo - Scrim Tactical');
  });

  it('supporte la forme tableau renvoyee parfois par PostgREST sur les jointures', async () => {
    // Quand une jointure to-one est typee comme to-many cote codegen, Supabase
    // renvoie un tableau a 1 element. Le helper aplatit via Array.isArray.
    store.matches = [
      {
        id: 'match-arr',
        tournament_id: 'tour-1',
        scrim_id: null,
        stage_id: null,
        round_name: null,
        match_format: null,
        scheduled_at: null,
        started_at: null,
        status: 'ongoing',
        team1_score: 1,
        team2_score: 2,
        lobby_code: null,
        stream_url: null,
        discord_thread_id: null,
        discord_scheduled_event_id: null,
        discord_dispute_thread_id: null,
        team1: [TEAM_1],
        team2: [TEAM_2],
        tournament: [{ id: 'tour-1', name: 'Spring Cup' }],
      },
    ];
    store.user_discord_links = [];

    const enriched = await enrichMatchEvent('match-arr');
    expect(enriched!.tournamentName).toBe('Spring Cup');
    expect(enriched!.team1!.id).toBe('team-1');
    expect(enriched!.team2!.id).toBe('team-2');
    expect(enriched!.team1Score).toBe(1);
    expect(enriched!.team2Score).toBe(2);
  });
});
