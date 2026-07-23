import { describe, it, expect, vi, beforeEach } from 'vitest';

const { sendTeamJoinEmail, sendWelcomeEmail, sendTeamAccessEmail } = vi.hoisted(
  () => ({
    sendTeamJoinEmail: vi.fn(async () => undefined),
    sendWelcomeEmail: vi.fn(async () => ({ success: true as const })),
    sendTeamAccessEmail: vi.fn(async () => ({ success: true as const })),
  })
);
vi.mock('@/utils/email', () => ({
  sendTeamJoinEmail,
  sendWelcomeEmail,
  sendTeamAccessEmail,
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAuthListUsers,
  setCreateUserResult,
  setAdminUser,
} from './__helpers__/supabaseMock';

// UUIDs valides utilisés par les tests du chemin `user_id` brut. La garde
// anti-abuse exige désormais un UUID valide ET un utilisateur existant.
const EXISTING_UID = '11111111-2222-3333-4444-555555555555';
const EXISTING_UID_2 = '66666666-7777-8888-9999-aaaaaaaaaaaa';

import createWithMemberHandler from '../../pages/api/teams/create-with-member';
import { generateChallenge } from '../../utils/captcha';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

/**
 * Génère un couple { captchaToken, captchaAnswer } valide pour le secret HMAC
 * actif (le même module captcha est utilisé par le handler). Le endpoint
 * /api/teams/create-with-member est public et exige désormais un captcha avant
 * toute création de compte ; on l'injecte par défaut dans le body de test.
 */
function validCaptcha(): { captchaToken: string; captchaAnswer: string } {
  const { token } = generateChallenge();
  const decoded = JSON.parse(Buffer.from(token, 'base64url').toString()) as {
    answer: number;
  };
  return { captchaToken: token, captchaAnswer: String(decoded.answer) };
}

function makeReq(over: Partial<any> = {}): any {
  const { body: overBody, ...rest } = over;
  // Captcha valide par défaut, fusionné avec le body fourni par le test.
  // Un test qui veut tester le rejet captcha peut écraser captchaToken/Answer.
  const body = { ...validCaptcha(), ...(overBody ?? {}) };
  return {
    method: 'POST',
    headers: { host: 'h' },
    query: {},
    ...rest,
    body,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  sendTeamJoinEmail.mockClear();
  sendWelcomeEmail.mockClear();
  sendTeamAccessEmail.mockClear();
});

/* -----------------------------------------------------------
 * /api/teams/create-with-member
 * ---------------------------------------------------------*/

describe('POST /api/teams/create-with-member', () => {
  it('405 on non-POST', async () => {
    const res = makeRes();
    await createWithMemberHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('400 when name too short', async () => {
    const res = makeRes();
    await createWithMemberHandler(makeReq({ body: { name: 'A' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('400 when name too long', async () => {
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({ body: { name: 'a'.repeat(101) } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when description too long', async () => {
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Alpha',
          description: 'd'.repeat(2001),
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when logo_url is invalid', async () => {
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Alpha',
          logo_url: 'javascript:alert(1)',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('400 when more than 5 members provided', async () => {
    const members = Array.from({ length: 6 }, (_, i) => ({
      email: `p${i}@example.com`,
      battle_tag: `Player${i}#1234`,
    }));
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: { name: 'Alpha', members },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 creates team alone (no members)', async () => {
    store.teams = [];
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: { name: 'Alpha Team' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).team.name).toBe('Alpha Team');
    expect((store.teams as any).length).toBe(1);
  });

  it('201 creates team with is_joinable=true by default (ouverte au recrutement)', async () => {
    store.teams = [];
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: { name: 'Joinable Team' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    // Le flag est posé explicitement dans le payload d'insert (pas seulement
    // via le défaut DB) : la nouvelle équipe doit apparaître dans la liste
    // « rejoindre » tant qu'elle n'est pas pleine.
    expect((store.teams as any)[0].is_joinable).toBe(true);
    expect((res.body as any).team.is_joinable).toBe(true);
  });

  it('201 creates team with normalized fields from a slugifiable name', async () => {
    store.teams = [];
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: { name: 'Hello World Team!', country: 'FR' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const inserted = (store.teams as any)[0];
    expect(inserted.name).toBe('Hello World Team!');
    expect(inserted.country).toBe('FR');
  });

  it('200 with member_email auto-creates user and adds member as captain', async () => {
    store.teams = [];
    store.team_members = [];
    setAuthListUsers([]); // user does not exist yet
    setCreateUserResult({
      data: { user: { id: 'u-new', email: 'cap@example.com' } },
      error: null,
    });
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'My Team',
          member_email: 'cap@example.com',
          member_battle_tag: 'Captain#1234',
          set_captain: true,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((store.teams as any)[0].captain_id).toBe('u-new');
    expect(store.team_members.length).toBe(1);
    // La capitaine ne doit recevoir QUE le magic-link d'accès — pas l'email
    // « vous avez rejoint l'équipe » (elle vient de créer l'équipe).
    expect(sendTeamAccessEmail).toHaveBeenCalledTimes(1);
    expect(sendTeamJoinEmail).not.toHaveBeenCalled();
  });

  // Invite-accept model : seul le capitaine (set_captain) est inséré dans
  // team_members ; les autres membres du roster deviennent des invitations
  // pending (demandes type='invite'), pas des team_members.
  it('200 with multiple members: captain inserted, others invited', async () => {
    store.teams = [];
    store.team_members = [];
    store.demandes = [];
    // p1 (captain) et p2 résolus comme users existants pour des ids stables.
    setAuthListUsers([
      { id: 'u-1', email: 'p1@example.com' },
      { id: 'u-2', email: 'p2@example.com' },
    ]);
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'My Team',
          members: [
            {
              email: 'p1@example.com',
              role: 'player',
              battle_tag: 'Player1#1234',
              set_captain: true,
            },
            {
              email: 'p2@example.com',
              role: 'player',
              battle_tag: 'Player2#5678',
              specialty: 'support',
            },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((store.teams as any).length).toBe(1);

    // Only the captain is on the roster.
    const members = (store.team_members as any[]) ?? [];
    expect(members.length).toBe(1);
    expect(members[0].user_id).toBe('u-1');
    expect((store.teams as any)[0].captain_id).toBe('u-1');

    // The non-captain member becomes a pending invite, not a team_member.
    const invites = (store.demandes as any[]).filter(
      (d) => d.type === 'invite' && d.status === 'pending'
    );
    expect(invites.length).toBe(1);
    expect(invites[0].user_id).toBe('u-2');
    expect(invites[0].source).toBe('website');
    expect(invites[0].payload.desired_role).toBe('player');
    expect(invites[0].payload.specialty).toBe('support');
    expect(invites[0].payload.battle_tag).toBe('Player2#5678');
    expect(invites[0].payload.captain_auth_user_id).toBe('u-1');

    // Response surfaces invitedMembers separately from members.
    expect((res.body as any).members.length).toBe(1);
    expect((res.body as any).invitedMembers.length).toBe(1);
    expect((res.body as any).invitedMembers[0].user_id).toBe('u-2');
    expect((res.body as any).invitedMembers[0].invitation_id).toBeTruthy();
  });

  // Ferme le trou « équipe orpheline sans capitaine » : des membres fournis
  // sans aucun set_captain → 400, et AUCUNE team créée (garde avant l'insert).
  it('400 when members provided but no captain designated (no team created)', async () => {
    setAuthListUsers([
      { id: 'u-1', email: 'p1@example.com' },
      { id: 'u-2', email: 'p2@example.com' },
    ]);
    store.teams = [];
    store.team_members = [];
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Orphan Team',
          members: [
            { email: 'p1@example.com', role: 'player', battle_tag: 'P1#1234' },
            { email: 'p2@example.com', role: 'player', battle_tag: 'P2#5678' },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/capitaine/i);
    expect((store.teams as any[]) ?? []).toHaveLength(0);
    expect((store.team_members as any[]) ?? []).toHaveLength(0);
  });

  it('400 when set_captain provided without any member', async () => {
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: { name: 'Alpha', set_captain: true },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  // Lot 6 : BattleTag est devenu optionnel hors inscription tournoi.
  // L'ancien test attendait 400 quand le BattleTag manquait — c'est
  // maintenant un cas valide (l'équipe peut être scrim-only).
  it('200 single member without battle_tag when no tournament_id (Lot 6)', async () => {
    setAuthListUsers([{ id: 'u1', email: 'p@example.com' }]);
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Alpha',
          member_email: 'p@example.com',
          member_role: 'player',
          set_captain: true,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    // captain créé avec battle_tag=null
    const tm = (store.team_members as any[]) ?? [];
    expect(tm.length).toBe(1);
    expect(tm[0].battle_tag).toBeNull();
  });

  it('400 single member without battle_tag WHEN tournament_id is set (Lot 6)', async () => {
    setAuthListUsers([{ id: 'u1', email: 'p@example.com' }]);
    store.tournaments = [
      { id: 'tour-1', name: 'Cup', status: 'published' },
    ] as any;
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Alpha',
          tournament_id: 'tour-1',
          member_email: 'p@example.com',
          member_role: 'player',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/BattleTag/);
  });

  it('400 when member battle_tag has invalid format (Lot 6: validation moved upstream)', async () => {
    setAuthListUsers([{ id: 'u1', email: 'p@example.com' }]);
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Alpha',
          member_email: 'p@example.com',
          member_role: 'player',
          member_battle_tag: 'invalid_no_hash',
        },
      }),
      res
    );
    // Lot 6 : la validation regex se fait avant le branchement email/user_id
    // donc l'erreur remonte en 400 (client error) au lieu d'un 500 qui
    // n'avait jamais beaucoup de sens.
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/BattleTag/);
  });

  // Lot 6 : idem en mode bulk — battle_tag optionnel sans tournament_id.
  it('201 bulk member without battle_tag when no tournament_id (Lot 6)', async () => {
    setAuthListUsers([{ id: 'u1', email: 'p1@example.com' }]);
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Alpha',
          members: [
            { email: 'p1@example.com', role: 'player', set_captain: true },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const tm = (store.team_members as any[]) ?? [];
    expect(tm[0].battle_tag).toBeNull();
  });

  it('400 bulk member missing battle_tag WHEN tournament_id is set (Lot 6)', async () => {
    setAuthListUsers([{ id: 'u1', email: 'p1@example.com' }]);
    store.tournaments = [
      { id: 'tour-1', name: 'Cup', status: 'published' },
    ] as any;
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Alpha',
          tournament_id: 'tour-1',
          members: [{ email: 'p1@example.com', role: 'player' }],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/BattleTag/);
  });

  it('200 auto-registers team to a published tournament', async () => {
    setAuthListUsers([{ id: 'u1', email: 'p1@example.com' }]);
    store.teams = [];
    store.team_members = [];
    store.tournaments = [
      {
        id: 'tour-1',
        name: 'Cup',
        status: 'published',
        max_teams: null,
        min_players: null,
      },
    ] as any;
    store.tournament_stages = [
      { id: 's1', tournament_id: 'tour-1' },
      { id: 's2', tournament_id: 'tour-1' },
    ] as any;
    store.stage_teams = [];
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Auto Reg Team',
          tournament_id: 'tour-1',
          members: [
            {
              email: 'p1@example.com',
              role: 'player',
              battle_tag: 'Player1#1234',
              set_captain: true,
            },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).tournament).toBeTruthy();
    expect((res.body as any).tournament.tournament_name).toBe('Cup');
    expect((store.stage_teams as any).length).toBe(2);
  });

  it('201 skips auto-register when tournament has too few players for min_players', async () => {
    setAuthListUsers([{ id: 'u1', email: 'p1@example.com' }]);
    store.teams = [];
    store.team_members = [];
    store.tournaments = [
      {
        id: 'tour-min',
        name: 'StrictCup',
        status: 'published',
        max_teams: null,
        min_players: 5,
      },
    ] as any;
    store.tournament_stages = [{ id: 's1', tournament_id: 'tour-min' }] as any;
    store.stage_teams = [];
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Underpowered',
          tournament_id: 'tour-min',
          members: [
            {
              email: 'p1@example.com',
              role: 'player',
              battle_tag: 'P1#1234',
              set_captain: true,
            },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).tournament).toBeFalsy();
  });

  it('201 auto-registers when the sole player meets min_players (coach not counted, player captain)', async () => {
    // min_players=1, un capitaine JOUEUR → 1 joueur inséré → passe.
    setAuthListUsers([{ id: 'u1', email: 'p1@example.com' }]);
    store.teams = [];
    store.team_members = [];
    store.tournaments = [
      {
        id: 'tour-coach-ok',
        name: 'CoachCup',
        status: 'published',
        max_teams: null,
        min_players: 1,
      },
    ] as any;
    store.tournament_stages = [
      { id: 's1', tournament_id: 'tour-coach-ok' },
    ] as any;
    store.stage_teams = [];
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'PlayerLed',
          tournament_id: 'tour-coach-ok',
          members: [
            {
              email: 'p1@example.com',
              role: 'player',
              battle_tag: 'P1#1234',
              set_captain: true,
            },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).tournament).toBeTruthy();
  });

  it('201 skips auto-register when the only inserted member is a coach (coach excluded from min_players)', async () => {
    // min_players=1 mais l'unique membre inséré (le capitaine) est un COACH
    // → 0 joueur → auto-register skippé.
    setAuthListUsers([{ id: 'u1', email: 'c1@example.com' }]);
    store.teams = [];
    store.team_members = [];
    store.tournaments = [
      {
        id: 'tour-coach-only',
        name: 'CoachOnlyCup',
        status: 'published',
        max_teams: null,
        min_players: 1,
      },
    ] as any;
    store.tournament_stages = [
      { id: 's1', tournament_id: 'tour-coach-only' },
    ] as any;
    store.stage_teams = [];
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'CoachLed',
          tournament_id: 'tour-coach-only',
          members: [
            {
              email: 'c1@example.com',
              role: 'coach',
              battle_tag: 'C1#1234',
              set_captain: true,
            },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).tournament).toBeFalsy();
  });

  it('201 with member_user_id directly (existing user, no email lookup)', async () => {
    store.teams = [];
    store.team_members = [];
    // La garde anti-abuse exige un UUID valide ET un utilisateur existant :
    // on seed l'utilisateur dans la table admin (getUserById le retournera).
    setAdminUser(EXISTING_UID, 'direct@example.com');
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Direct UID Team',
          member_user_id: EXISTING_UID,
          member_role: 'player',
          member_battle_tag: 'Direct#9999',
          set_captain: true,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((store.team_members as any).length).toBe(1);
    expect((store.team_members as any)[0].user_id).toBe(EXISTING_UID);
    // Capitaine épinglé uniquement après validation existence.
    expect((store.teams as any)[0].captain_id).toBe(EXISTING_UID);
  });

  // SECURITY : un user_id qui n'est pas un UUID est rejeté (anti-injection de
  // chaîne arbitraire) AVANT toute écriture en base.
  it('400 when member_user_id is not a valid UUID', async () => {
    store.teams = [];
    store.team_members = [];
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Bad UID Team',
          member_user_id: 'u-direct',
          member_role: 'player',
          member_battle_tag: 'Direct#9999',
          set_captain: true,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(/user id/i);
    // Aucune équipe ni membre créé : la garde s'exécute avant l'insert team.
    expect((store.teams as any[]) ?? []).toHaveLength(0);
    expect((store.team_members as any[]) ?? []).toHaveLength(0);
  });

  // SECURITY : un UUID bien formé mais qui ne correspond à AUCUN utilisateur
  // existant est rejeté. Bloque l'épinglage d'un id fabriqué.
  it('400 when member_user_id is a UUID for a non-existent user', async () => {
    store.teams = [];
    store.team_members = [];
    // Aucun setAdminUser → getUserById renvoie { user: null }.
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Ghost UID Team',
          member_user_id: EXISTING_UID,
          member_role: 'player',
          member_battle_tag: 'Ghost#9999',
          set_captain: true,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).error).toMatch(
      /unknown user id|no matching user/i
    );
    expect((store.teams as any[]) ?? []).toHaveLength(0);
    expect((store.team_members as any[]) ?? []).toHaveLength(0);
  });

  it('400 when single member_user_id has invalid battle_tag format', async () => {
    setAdminUser(EXISTING_UID, 'direct@example.com');
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'BadBT',
          member_user_id: EXISTING_UID,
          member_role: 'player',
          member_battle_tag: 'no_hash',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 with bulk members where one has (existing) user_id and one has email: captain inserted, other invited', async () => {
    setAuthListUsers([{ id: 'u-existing', email: 'existing@example.com' }]);
    setAdminUser(EXISTING_UID, 'tank@example.com');
    store.teams = [];
    store.team_members = [];
    store.demandes = [];
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Mixed Team',
          members: [
            {
              user_id: EXISTING_UID,
              role: 'tank',
              battle_tag: 'Tank#1234',
              set_captain: true,
            },
            {
              email: 'existing@example.com',
              role: 'support',
              battle_tag: 'Sup#5678',
            },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    // Captain (user_id path) inserted; email member invited (pending invite).
    expect((store.team_members as any).length).toBe(1);
    expect((store.team_members as any)[0].user_id).toBe(EXISTING_UID);
    const invites = (store.demandes as any[]).filter(
      (d) => d.type === 'invite' && d.status === 'pending'
    );
    expect(invites.length).toBe(1);
    expect(invites[0].user_id).toBe('u-existing');
    expect(invites[0].payload.captain_auth_user_id).toBe(EXISTING_UID);
  });

  // SECURITY : dans le chemin bulk, un user_id brut invalide (non-existant) est
  // rejeté et l'équipe entière est refusée (pas d'insertion partielle).
  it('400 bulk member with a non-existent user_id (rejected, no team created)', async () => {
    setAuthListUsers([{ id: 'u-existing', email: 'existing@example.com' }]);
    store.teams = [];
    store.team_members = [];
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Pinned Victim Team',
          members: [
            {
              // UUID valide mais aucun utilisateur correspondant (pas de
              // setAdminUser) → rejeté avant tout insert.
              user_id: EXISTING_UID_2,
              role: 'tank',
              battle_tag: 'Tank#1234',
              set_captain: true,
            },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((store.teams as any[]) ?? []).toHaveLength(0);
    expect((store.team_members as any[]) ?? []).toHaveLength(0);
  });

  it('201 skips auto-register when tournament status is not published', async () => {
    setAuthListUsers([{ id: 'u1', email: 'p1@example.com' }]);
    store.teams = [];
    store.team_members = [];
    store.tournaments = [
      {
        id: 'tour-d',
        name: 'Draft',
        status: 'draft',
        max_teams: null,
        min_players: null,
      },
    ] as any;
    store.tournament_stages = [{ id: 's1', tournament_id: 'tour-d' }] as any;
    store.stage_teams = [];
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Test',
          tournament_id: 'tour-d',
          members: [
            {
              email: 'p1@example.com',
              role: 'player',
              battle_tag: 'Player1#1234',
              set_captain: true,
            },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((res.body as any).tournament).toBeFalsy();
  });

  // Specialty in-game (tank | dps | support | flex | null)
  it('201 persists a valid member specialty', async () => {
    setAuthListUsers([{ id: 'u1', email: 'p1@example.com' }]);
    store.teams = [];
    store.team_members = [];
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Spec Team',
          members: [
            {
              email: 'p1@example.com',
              role: 'player',
              specialty: 'tank',
              set_captain: true,
            },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const tm = (store.team_members as any[]) ?? [];
    expect(tm[0].specialty).toBe('tank');
    expect((res.body as any).members[0].specialty).toBe('tank');
  });

  it('201 normalizes an unknown specialty to null', async () => {
    setAuthListUsers([{ id: 'u1', email: 'p1@example.com' }]);
    store.teams = [];
    store.team_members = [];
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Spec Team 2',
          members: [
            {
              email: 'p1@example.com',
              role: 'player',
              specialty: 'wizard',
              set_captain: true,
            },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    const tm = (store.team_members as any[]) ?? [];
    expect(tm[0].specialty).toBeNull();
  });
});
