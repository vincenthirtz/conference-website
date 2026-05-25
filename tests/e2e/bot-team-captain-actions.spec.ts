/**
 * Tests E2E — Bot captain-side team management
 *
 *  POST   /api/bot/v1/teams/[teamId]/invitations               /inviter
 *  POST   /api/bot/v1/invitations/[demandeId]                  accept/reject/cancel
 *  GET    /api/bot/v1/players/by-discord/[id]/invitations      list pending
 *  DELETE /api/bot/v1/teams/[teamId]/members                   /kicker
 *  POST   /api/bot/v1/teams/[teamId]/transfer-captain          /transferer-capitaine
 *  POST   /api/bot/v1/teams/leave                              /quitter-equipe
 *  POST   /api/bot/v1/tournaments/[id]/teams (captain path)    /inscrire-mon-equipe
 *
 * Pré-requis : la migration database/migrations/add_invite_type_to_demandes.sql
 * doit être appliquée (CHECK constraint demandes_type_check doit autoriser
 * 'invite').
 */
import { test, expect } from '@playwright/test';
import {
  supabaseTestClient,
  createTestPlayer,
  deleteTestUser,
} from '../utils/supabaseTestClient';

const API_KEY = process.env.BOT_API_KEY;
const HAS_KEY = Boolean(API_KEY);
const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();

function discordId(suffix: number): string {
  return `${8_500_000_000_000_000_000n + BigInt((TS + suffix) % 1_000_000_000)}`;
}

const CAPTAIN_DISCORD = discordId(1);
const MEMBER_DISCORD = discordId(2);
const OUTSIDER_DISCORD = discordId(3);
const OTHER_CAPTAIN_DISCORD = discordId(4);

const CAPTAIN_EMAIL = `bot-cap-captain-${TS}@test.local`;
const MEMBER_EMAIL = `bot-cap-member-${TS}@test.local`;
const OUTSIDER_EMAIL = `bot-cap-outsider-${TS}@test.local`;
const OTHER_CAPTAIN_EMAIL = `bot-cap-other-${TS}@test.local`;

let captainAuthId: string;
let memberAuthId: string;
let outsiderAuthId: string;
let otherCaptainAuthId: string;
let teamId: string;
let otherTeamId: string;
let tournamentId: string;
let stageId: string;

// Invitations crees au fil des tests, nettoyes au teardown.
const createdInvitationIds: string[] = [];

test.describe.serial('Bot captain actions — setup & shared fixtures', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;

    const [captain, member, outsider, other] = await Promise.all([
      createTestPlayer(CAPTAIN_EMAIL, 'TestPass123!'),
      createTestPlayer(MEMBER_EMAIL, 'TestPass123!'),
      createTestPlayer(OUTSIDER_EMAIL, 'TestPass123!'),
      createTestPlayer(OTHER_CAPTAIN_EMAIL, 'TestPass123!'),
    ]);
    captainAuthId = captain!.id;
    memberAuthId = member!.id;
    outsiderAuthId = outsider!.id;
    otherCaptainAuthId = other!.id;

    await supabaseTestClient.from('user_discord_links').insert([
      {
        auth_user_id: captainAuthId,
        discord_user_id: CAPTAIN_DISCORD,
        discord_username: `cap_${TS}`,
      },
      {
        auth_user_id: memberAuthId,
        discord_user_id: MEMBER_DISCORD,
        discord_username: `mem_${TS}`,
      },
      {
        auth_user_id: outsiderAuthId,
        discord_user_id: OUTSIDER_DISCORD,
        discord_username: `out_${TS}`,
      },
      {
        auth_user_id: otherCaptainAuthId,
        discord_user_id: OTHER_CAPTAIN_DISCORD,
        discord_username: `oth_${TS}`,
      },
    ]);

    // Team principale : CAPTAIN + MEMBER
    const { data: t1 } = await supabaseTestClient
      .from('teams')
      .insert({
        name: `Bot Cap Team ${TS}`,
        slug: `bot-cap-team-${TS}`,
        captain_id: captainAuthId,
        is_active: true,
      })
      .select('id')
      .single();
    teamId = t1!.id;

    await supabaseTestClient.from('team_members').insert([
      { team_id: teamId, user_id: captainAuthId, role: 'captain' },
      { team_id: teamId, user_id: memberAuthId, role: 'player' },
    ]);

    // Seconde team : OTHER_CAPTAIN — pour tester les croisements
    const { data: t2 } = await supabaseTestClient
      .from('teams')
      .insert({
        name: `Bot Cap Other ${TS}`,
        slug: `bot-cap-other-${TS}`,
        captain_id: otherCaptainAuthId,
        is_active: true,
      })
      .select('id')
      .single();
    otherTeamId = t2!.id;
    await supabaseTestClient.from('team_members').insert({
      team_id: otherTeamId,
      user_id: otherCaptainAuthId,
      role: 'captain',
    });

    // Tournoi published + 1 stage
    const { data: tour } = await supabaseTestClient
      .from('tournaments')
      .insert({
        name: `Bot Cap Tour ${TS}`,
        slug: `bot-cap-tour-${TS}`,
        status: 'published',
        game: 'overwatch',
      })
      .select('id')
      .single();
    tournamentId = tour!.id;

    const { data: stage } = await supabaseTestClient
      .from('tournament_stages')
      .insert({
        tournament_id: tournamentId,
        name: 'Phase 1',
        kind: 'swiss',
        order_index: 0,
      })
      .select('id')
      .single();
    stageId = stage!.id;
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    if (createdInvitationIds.length > 0) {
      await supabaseTestClient
        .from('demandes')
        .delete()
        .in('id', createdInvitationIds);
    }
    if (stageId) {
      await supabaseTestClient
        .from('stage_teams')
        .delete()
        .eq('stage_id', stageId);
      await supabaseTestClient
        .from('tournament_stages')
        .delete()
        .eq('id', stageId);
    }
    if (tournamentId) {
      await supabaseTestClient
        .from('tournaments')
        .delete()
        .eq('id', tournamentId);
    }
    for (const tid of [teamId, otherTeamId].filter(Boolean)) {
      await supabaseTestClient.from('team_members').delete().eq('team_id', tid);
      await supabaseTestClient.from('teams').delete().eq('id', tid);
    }
    const ids = [
      captainAuthId,
      memberAuthId,
      outsiderAuthId,
      otherCaptainAuthId,
    ].filter(Boolean);
    if (ids.length > 0) {
      await supabaseTestClient
        .from('user_discord_links')
        .delete()
        .in('auth_user_id', ids);
    }
    await Promise.all([
      deleteTestUser(CAPTAIN_EMAIL),
      deleteTestUser(MEMBER_EMAIL),
      deleteTestUser(OUTSIDER_EMAIL),
      deleteTestUser(OTHER_CAPTAIN_EMAIL),
    ]);
  });

  test('fixtures prêtes', async () => {
    expect(teamId).toBeTruthy();
    expect(otherTeamId).toBeTruthy();
    expect(tournamentId).toBeTruthy();
  });
});

/* ------------------------------------------------------------------------- */
/* POST /api/bot/v1/teams/[teamId]/invitations  (capitaine crée)             */
/* ------------------------------------------------------------------------- */

let pendingInvitationId: string;
let invitationToRejectId: string;
let invitationToCancelId: string;

test.describe.serial('Bot /inviter — POST /teams/[teamId]/invitations', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('401 sans clé', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/teams/${teamId}/invitations`,
      { data: {} }
    );
    expect([401, 500]).toContain(res.status());
  });

  test('405 si GET', async ({ request }) => {
    const res = await request.get(`/api/bot/v1/teams/${teamId}/invitations`, {
      headers: { 'x-api-key': API_KEY! },
    });
    expect(res.status()).toBe(405);
  });

  test('400 si teamId pas un UUID', async ({ request }) => {
    const res = await request.post('/api/bot/v1/teams/not-a-uuid/invitations', {
      headers: { 'x-api-key': API_KEY! },
      data: { actorDiscordUserId: CAPTAIN_DISCORD },
    });
    expect(res.status()).toBe(400);
  });

  test('400 si actorDiscordUserId manquant', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/teams/${teamId}/invitations`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {},
      }
    );
    expect(res.status()).toBe(400);
  });

  test('403 si actor pas capitaine de cette équipe', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/teams/${teamId}/invitations`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: OTHER_CAPTAIN_DISCORD,
          targetDiscordUserId: OUTSIDER_DISCORD,
        },
      }
    );
    expect(res.status()).toBe(403);
  });

  test('400 si targetDiscordUserId manquant', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/teams/${teamId}/invitations`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: CAPTAIN_DISCORD },
      }
    );
    expect(res.status()).toBe(400);
  });

  test('404 si target pas liée au site', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/teams/${teamId}/invitations`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: CAPTAIN_DISCORD,
          targetDiscordUserId: discordId(99),
        },
      }
    );
    expect(res.status()).toBe(404);
  });

  test('400 si target déjà membre de la team (MEMBER)', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/teams/${teamId}/invitations`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: CAPTAIN_DISCORD,
          targetDiscordUserId: MEMBER_DISCORD,
        },
      }
    );
    expect(res.status()).toBe(400);
  });

  test('400 si BattleTag mal formé', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/teams/${teamId}/invitations`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: CAPTAIN_DISCORD,
          targetDiscordUserId: OUTSIDER_DISCORD,
          battleTag: 'pas un battletag',
        },
      }
    );
    expect(res.status()).toBe(400);
  });

  test('201 happy path : crée invitation pending pour OUTSIDER', async ({
    request,
  }) => {
    const res = await request.post(
      `/api/bot/v1/teams/${teamId}/invitations`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: CAPTAIN_DISCORD,
          targetDiscordUserId: OUTSIDER_DISCORD,
          role: 'player',
          comment: 'Tu joins?',
        },
      }
    );
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.invitation.type).toBe('invite');
    expect(body.invitation.status).toBe('pending');
    expect(body.invitation.user_id).toBe(outsiderAuthId);
    expect(body.invitation.team_id).toBe(teamId);
    expect(body.invitation.payload.invitee_discord_user_id).toBe(OUTSIDER_DISCORD);
    expect(body.invitation.payload.expires_at).toBeTruthy();
    pendingInvitationId = body.invitation.id;
    createdInvitationIds.push(pendingInvitationId);
  });

  test('409 si invitation pending déjà existante pour ce couple', async ({
    request,
  }) => {
    const res = await request.post(
      `/api/bot/v1/teams/${teamId}/invitations`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: CAPTAIN_DISCORD,
          targetDiscordUserId: OUTSIDER_DISCORD,
        },
      }
    );
    expect(res.status()).toBe(409);
  });
});

/* ------------------------------------------------------------------------- */
/* GET /api/bot/v1/players/by-discord/[id]/invitations                       */
/* ------------------------------------------------------------------------- */

test.describe.serial('Bot list invitations — GET /players/.../invitations', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('400 si discordUserId invalide', async ({ request }) => {
    const res = await request.get(
      '/api/bot/v1/players/by-discord/abc/invitations',
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(400);
  });

  test('404 si Discord ID non lié', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/players/by-discord/${discordId(88)}/invitations`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(404);
  });

  test('200 : OUTSIDER a 1 invitation pending', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/players/by-discord/${OUTSIDER_DISCORD}/invitations`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.invitations.length).toBe(1);
    expect(body.invitations[0].id).toBe(pendingInvitationId);
    expect(body.invitations[0].team.id).toBe(teamId);
  });

  test('200 : MEMBER (pas invitée) → liste vide', async ({ request }) => {
    const res = await request.get(
      `/api/bot/v1/players/by-discord/${MEMBER_DISCORD}/invitations`,
      { headers: { 'x-api-key': API_KEY! } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.invitations).toEqual([]);
  });
});

/* ------------------------------------------------------------------------- */
/* POST /api/bot/v1/invitations/[demandeId]                                  */
/* ------------------------------------------------------------------------- */

test.describe.serial('Bot accept/reject/cancel — POST /invitations/[id]', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('400 si action invalide', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/invitations/${pendingInvitationId}`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: OUTSIDER_DISCORD, action: 'foo' },
      }
    );
    expect(res.status()).toBe(400);
  });

  test('403 si accept par quelqu’un d’autre que l’invitée', async ({
    request,
  }) => {
    const res = await request.post(
      `/api/bot/v1/invitations/${pendingInvitationId}`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: CAPTAIN_DISCORD, action: 'accept' },
      }
    );
    expect(res.status()).toBe(403);
  });

  test('403 si cancel par quelqu’un d’autre que le capitaine émetteur', async ({
    request,
  }) => {
    const res = await request.post(
      `/api/bot/v1/invitations/${pendingInvitationId}`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: OTHER_CAPTAIN_DISCORD, action: 'cancel' },
      }
    );
    expect(res.status()).toBe(403);
  });

  test('200 accept : OUTSIDER accepte → ajout team_members + status=approved', async ({
    request,
  }) => {
    const res = await request.post(
      `/api/bot/v1/invitations/${pendingInvitationId}`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: OUTSIDER_DISCORD, action: 'accept' },
      }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.teamId).toBe(teamId);

    const { data: m } = await supabaseTestClient!
      .from('team_members')
      .select('user_id, role')
      .eq('team_id', teamId)
      .eq('user_id', outsiderAuthId)
      .maybeSingle();
    expect(m).toBeTruthy();

    const { data: d } = await supabaseTestClient!
      .from('demandes')
      .select('status')
      .eq('id', pendingInvitationId)
      .single();
    expect(d!.status).toBe('approved');
  });

  test('409 accept sur invitation déjà traitée', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/invitations/${pendingInvitationId}`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: OUTSIDER_DISCORD, action: 'accept' },
      }
    );
    expect(res.status()).toBe(409);
  });

  test('reject flow : nouvelle invite → OUTSIDER refuse', async ({ request }) => {
    // OUTSIDER est dans la team apres l'accept. Pour tester reject, on
    // l'enleve d'abord puis on recree une invite.
    await supabaseTestClient!
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', outsiderAuthId);

    const create = await request.post(
      `/api/bot/v1/teams/${teamId}/invitations`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: CAPTAIN_DISCORD,
          targetDiscordUserId: OUTSIDER_DISCORD,
        },
      }
    );
    expect(create.status()).toBe(201);
    invitationToRejectId = (await create.json()).invitation.id;
    createdInvitationIds.push(invitationToRejectId);

    const res = await request.post(
      `/api/bot/v1/invitations/${invitationToRejectId}`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: OUTSIDER_DISCORD, action: 'reject' },
      }
    );
    expect(res.status()).toBe(200);

    const { data: d } = await supabaseTestClient!
      .from('demandes')
      .select('status')
      .eq('id', invitationToRejectId)
      .single();
    expect(d!.status).toBe('rejected');

    // Outsider PAS ajouté à la team
    const { data: m } = await supabaseTestClient!
      .from('team_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('user_id', outsiderAuthId)
      .maybeSingle();
    expect(m).toBeNull();
  });

  test('cancel flow : capitaine annule sa propre invite', async ({ request }) => {
    const create = await request.post(
      `/api/bot/v1/teams/${teamId}/invitations`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: CAPTAIN_DISCORD,
          targetDiscordUserId: OUTSIDER_DISCORD,
        },
      }
    );
    expect(create.status()).toBe(201);
    invitationToCancelId = (await create.json()).invitation.id;
    createdInvitationIds.push(invitationToCancelId);

    const res = await request.post(
      `/api/bot/v1/invitations/${invitationToCancelId}`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: { actorDiscordUserId: CAPTAIN_DISCORD, action: 'cancel' },
      }
    );
    expect(res.status()).toBe(200);

    const { data: d } = await supabaseTestClient!
      .from('demandes')
      .select('status')
      .eq('id', invitationToCancelId)
      .single();
    expect(d!.status).toBe('cancelled');
  });
});

/* ------------------------------------------------------------------------- */
/* DELETE /api/bot/v1/teams/[teamId]/members (kicker)                        */
/* ------------------------------------------------------------------------- */

test.describe.serial('Bot /kicker — DELETE /teams/[teamId]/members', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('403 si actor pas capitaine', async ({ request }) => {
    const res = await request.delete(`/api/bot/v1/teams/${teamId}/members`, {
      headers: { 'x-api-key': API_KEY! },
      data: {
        actorDiscordUserId: OTHER_CAPTAIN_DISCORD,
        targetDiscordUserId: MEMBER_DISCORD,
      },
    });
    expect(res.status()).toBe(403);
  });

  test('400 si target = capitaine (refus auto-kick)', async ({ request }) => {
    const res = await request.delete(`/api/bot/v1/teams/${teamId}/members`, {
      headers: { 'x-api-key': API_KEY! },
      data: {
        actorDiscordUserId: CAPTAIN_DISCORD,
        targetDiscordUserId: CAPTAIN_DISCORD,
      },
    });
    expect(res.status()).toBe(400);
  });

  test('404 si target pas dans la team', async ({ request }) => {
    const res = await request.delete(`/api/bot/v1/teams/${otherTeamId}/members`, {
      headers: { 'x-api-key': API_KEY! },
      data: {
        actorDiscordUserId: OTHER_CAPTAIN_DISCORD,
        targetDiscordUserId: MEMBER_DISCORD,
      },
    });
    expect(res.status()).toBe(404);
  });

  test('200 happy path : retire MEMBER', async ({ request }) => {
    const res = await request.delete(`/api/bot/v1/teams/${teamId}/members`, {
      headers: { 'x-api-key': API_KEY! },
      data: {
        actorDiscordUserId: CAPTAIN_DISCORD,
        targetDiscordUserId: MEMBER_DISCORD,
      },
    });
    expect(res.status()).toBe(200);

    const { data: m } = await supabaseTestClient!
      .from('team_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('user_id', memberAuthId)
      .maybeSingle();
    expect(m).toBeNull();
  });
});

/* ------------------------------------------------------------------------- */
/* POST /api/bot/v1/teams/[teamId]/transfer-captain                          */
/* ------------------------------------------------------------------------- */

test.describe.serial(
  'Bot /transferer-capitaine — POST /teams/[teamId]/transfer-captain',
  () => {
    test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

    test.beforeAll(async () => {
      if (!supabaseTestClient) return;
      // À ce stade : la team contient juste CAPTAIN (MEMBER kické, OUTSIDER
      // jamais accepté la dernière invite). Pour tester le transfert, on
      // remet OUTSIDER en place directement via DB.
      await supabaseTestClient.from('team_members').insert({
        team_id: teamId,
        user_id: outsiderAuthId,
        role: 'player',
      });
    });

    test('400 si newCaptainDiscordUserId manquant', async ({ request }) => {
      const res = await request.post(
        `/api/bot/v1/teams/${teamId}/transfer-captain`,
        {
          headers: { 'x-api-key': API_KEY! },
          data: { actorDiscordUserId: CAPTAIN_DISCORD },
        }
      );
      expect(res.status()).toBe(400);
    });

    test('403 si actor pas capitaine', async ({ request }) => {
      const res = await request.post(
        `/api/bot/v1/teams/${teamId}/transfer-captain`,
        {
          headers: { 'x-api-key': API_KEY! },
          data: {
            actorDiscordUserId: OTHER_CAPTAIN_DISCORD,
            newCaptainDiscordUserId: OUTSIDER_DISCORD,
          },
        }
      );
      expect(res.status()).toBe(403);
    });

    test('400 si new captain = self', async ({ request }) => {
      const res = await request.post(
        `/api/bot/v1/teams/${teamId}/transfer-captain`,
        {
          headers: { 'x-api-key': API_KEY! },
          data: {
            actorDiscordUserId: CAPTAIN_DISCORD,
            newCaptainDiscordUserId: CAPTAIN_DISCORD,
          },
        }
      );
      expect(res.status()).toBe(400);
    });

    test('400 si new captain pas membre', async ({ request }) => {
      const res = await request.post(
        `/api/bot/v1/teams/${teamId}/transfer-captain`,
        {
          headers: { 'x-api-key': API_KEY! },
          data: {
            actorDiscordUserId: CAPTAIN_DISCORD,
            newCaptainDiscordUserId: OTHER_CAPTAIN_DISCORD,
          },
        }
      );
      expect(res.status()).toBe(400);
    });

    test('200 happy path + DB.captain_id mis à jour', async ({ request }) => {
      const res = await request.post(
        `/api/bot/v1/teams/${teamId}/transfer-captain`,
        {
          headers: { 'x-api-key': API_KEY! },
          data: {
            actorDiscordUserId: CAPTAIN_DISCORD,
            newCaptainDiscordUserId: OUTSIDER_DISCORD,
          },
        }
      );
      expect(res.status()).toBe(200);

      const { data: t } = await supabaseTestClient!
        .from('teams')
        .select('captain_id')
        .eq('id', teamId)
        .single();
      expect(t!.captain_id).toBe(outsiderAuthId);

      // Restaurer CAPTAIN pour les blocs suivants
      await supabaseTestClient!
        .from('teams')
        .update({ captain_id: captainAuthId })
        .eq('id', teamId);
    });
  }
);

/* ------------------------------------------------------------------------- */
/* POST /api/bot/v1/teams/leave (quitter)                                    */
/* ------------------------------------------------------------------------- */

test.describe.serial('Bot /quitter-equipe — POST /teams/leave', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('400 si actorDiscordUserId manquant', async ({ request }) => {
    const res = await request.post('/api/bot/v1/teams/leave', {
      headers: { 'x-api-key': API_KEY! },
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test("400 si l'acteur n'est dans aucune team", async ({ request }) => {
    const TMP_EMAIL = `bot-cap-noteam-${TS}@test.local`;
    const TMP_DISCORD = discordId(77);
    const tmp = await createTestPlayer(TMP_EMAIL, 'TestPass123!');
    await supabaseTestClient!.from('user_discord_links').insert({
      auth_user_id: tmp!.id,
      discord_user_id: TMP_DISCORD,
      discord_username: `tmp_${TS}`,
    });

    const res = await request.post('/api/bot/v1/teams/leave', {
      headers: { 'x-api-key': API_KEY! },
      data: { actorDiscordUserId: TMP_DISCORD },
    });
    expect(res.status()).toBe(400);

    await supabaseTestClient!
      .from('user_discord_links')
      .delete()
      .eq('auth_user_id', tmp!.id);
    await deleteTestUser(TMP_EMAIL);
  });

  test("403 si l'acteur est capitaine", async ({ request }) => {
    const res = await request.post('/api/bot/v1/teams/leave', {
      headers: { 'x-api-key': API_KEY! },
      data: { actorDiscordUserId: CAPTAIN_DISCORD },
    });
    expect(res.status()).toBe(403);
  });

  test('200 happy path : OUTSIDER quitte la team', async ({ request }) => {
    const res = await request.post('/api/bot/v1/teams/leave', {
      headers: { 'x-api-key': API_KEY! },
      data: { actorDiscordUserId: OUTSIDER_DISCORD },
    });
    expect(res.status()).toBe(200);

    const { data: m } = await supabaseTestClient!
      .from('team_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('user_id', outsiderAuthId)
      .maybeSingle();
    expect(m).toBeNull();
  });
});

/* ------------------------------------------------------------------------- */
/* POST /api/bot/v1/tournaments/[id]/teams — captain self-register branch    */
/* ------------------------------------------------------------------------- */

test.describe.serial('Bot /inscrire-mon-equipe — captain self-register', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  test('403 si capitaine essaie d’inscrire une team qui n’est pas la sienne', async ({
    request,
  }) => {
    const res = await request.post(
      `/api/bot/v1/tournaments/${tournamentId}/teams`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: CAPTAIN_DISCORD,
          teamId: otherTeamId,
        },
      }
    );
    expect(res.status()).toBe(403);
  });

  test('201 capitaine auto-inscrit sa propre équipe', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/tournaments/${tournamentId}/teams`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: CAPTAIN_DISCORD,
          teamId,
        },
      }
    );
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.stageIds).toContain(stageId);
  });

  test('409 si déjà inscrite', async ({ request }) => {
    const res = await request.post(
      `/api/bot/v1/tournaments/${tournamentId}/teams`,
      {
        headers: { 'x-api-key': API_KEY! },
        data: {
          actorDiscordUserId: CAPTAIN_DISCORD,
          teamId,
        },
      }
    );
    expect(res.status()).toBe(409);
  });
});
