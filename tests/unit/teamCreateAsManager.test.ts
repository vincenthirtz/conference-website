// Unit tests for pages/api/teams/create-with-member.ts — mode « créée par un
// MANAGER » (`manager_email`).
//
// Rappel du flux capitaine (couvert par apiRoutesBatch34.test.ts) : la
// créatrice est la capitaine, elle est insérée dans team_members, elle devient
// `teams.captain_id`, et elle invite le reste du roster.
//
// Mode manager : la personne qui crée l'équipe l'encadre sans y jouer.
//   - elle est insérée dans team_members avec le rôle `manager` (rôle à
//     permissions, cf. utils/teamRoles.ts) ;
//   - `teams.captain_id` reste NULL : la capitaine désignée n'est qu'INVITÉE
//     (consentement requis), son invitation porte `payload.set_captain = true`
//     et elle prendra le capitanat en acceptant ;
//   - TOUT le roster est invité, le manager étant l'inviteur ;
//   - le magic-link d'accès à l'espace équipe part vers le manager, SANS
//     `welcome=1` (la carte d'onboarding Battle.net ne le concerne pas).
//
// Couverture :
//   - 201 nominal : insert manager + captain_id null + invitations + set_captain
//   - magic-link vers le manager, sans welcome=1
//   - capitaine facultative en mode manager (roster invité, aucun capitanat)
//   - 400 MANAGER_DUPLICATE (email manager présent dans le roster)
//   - 400 MANAGER_EMAIL_INVALID
//   - le manager ne compte pas comme joueuse pour `min_players` : l'équipe
//     n'est pas INSCRITE (roster confirmé vide) mais une CANDIDATURE est
//     déposée — sans exigence d'effectif minimum, le staff arbitre

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  sendTeamJoinEmail,
  sendWelcomeEmail,
  sendTeamAccessEmail,
  sendTeamInviteLinkEmail,
} = vi.hoisted(() => ({
  sendTeamJoinEmail: vi.fn(async () => undefined),
  sendWelcomeEmail: vi.fn(async () => ({ success: true as const })),
  sendTeamAccessEmail: vi.fn(
    async (_input: { to: string; teamName: string; actionLink: string }) => ({
      success: true as const,
    })
  ),
  sendTeamInviteLinkEmail: vi.fn(
    async (_input: {
      to: string;
      teamName: string;
      role: string;
      asCaptain?: boolean;
      inviteUrl: string;
    }) => ({ success: true as const })
  ),
}));
vi.mock('@/utils/email', () => ({
  sendTeamJoinEmail,
  sendWelcomeEmail,
  sendTeamAccessEmail,
  sendTeamInviteLinkEmail,
}));

import {
  store,
  resetSupabaseMock,
  setAuthListUsers,
} from './__helpers__/supabaseMock';

import createWithMemberHandler from '../../pages/api/teams/create-with-member';
import { generateChallenge } from '../../utils/captcha';

function validCaptcha() {
  const { token, question: _q } = generateChallenge();
  const decoded = JSON.parse(
    Buffer.from(token.split('.')[0], 'base64url').toString()
  ) as { answer: number };
  return { captchaToken: token, captchaAnswer: String(decoded.answer) };
}

function makeReq(over: Partial<any> = {}): any {
  const { body: overBody, ...rest } = over;
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

const ROSTER = [
  { id: 'u-cap', email: 'cap@example.com' },
  { id: 'u-p2', email: 'p2@example.com' },
  { id: 'u-mgr', email: 'mgr@example.com' },
];

beforeEach(() => {
  resetSupabaseMock();
  sendTeamJoinEmail.mockClear();
  sendWelcomeEmail.mockClear();
  sendTeamAccessEmail.mockClear();
  sendTeamInviteLinkEmail.mockClear();
  store.teams = [];
  store.team_members = [];
  store.demandes = [];
  setAuthListUsers(ROSTER);
});

describe('POST /api/teams/create-with-member — mode manager', () => {
  it('insère le manager, laisse captain_id NULL et invite tout le roster', async () => {
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Managed Team',
          manager_email: 'mgr@example.com',
          members: [
            {
              email: 'cap@example.com',
              role: 'player',
              battle_tag: 'Cap#1234',
              set_captain: true,
            },
            {
              email: 'p2@example.com',
              role: 'player',
              battle_tag: 'P2#5678',
              specialty: 'support',
            },
          ],
        },
      }),
      res
    );

    expect(res.statusCode).toBe(201);

    // Seul le manager est sur le roster — les joueuses sont invitées.
    const members = (store.team_members as any[]) ?? [];
    expect(members).toHaveLength(1);
    expect(members[0].user_id).toBe('u-mgr');
    expect(members[0].role).toBe('manager');
    expect(members[0].battle_tag).toBeNull();

    // Aucune capitaine tant que la désignée n'a pas accepté.
    expect((store.teams as any)[0].captain_id ?? null).toBeNull();

    const invites = (store.demandes as any[]).filter(
      (d) => d.type === 'invite' && d.status === 'pending'
    );
    expect(invites).toHaveLength(2);
    // Le manager est l'inviteur des deux.
    expect(
      invites.every((i) => i.payload.captain_auth_user_id === 'u-mgr')
    ).toBe(true);

    const capInvite = invites.find((i) => i.user_id === 'u-cap');
    expect(capInvite.payload.set_captain).toBe(true);
    const otherInvite = invites.find((i) => i.user_id === 'u-p2');
    // Pas de clé parasite sur les invitations normales.
    expect(otherInvite.payload.set_captain).toBeUndefined();

    // Réponse : le manager est le seul membre inséré, 2 invitations.
    expect((res.body as any).members).toHaveLength(1);
    expect((res.body as any).members[0].role).toBe('manager');
    expect((res.body as any).invitedMembers).toHaveLength(2);
  });

  it('envoie à chaque invitée son lien privé (sinon personne ne sait qu’elle est invitée)', async () => {
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Managed Team',
          manager_email: 'mgr@example.com',
          members: [
            {
              email: 'cap@example.com',
              role: 'player',
              battle_tag: 'Cap#1234',
              set_captain: true,
            },
            { email: 'p2@example.com', role: 'player', battle_tag: 'P2#5678' },
          ],
        },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    expect(sendTeamInviteLinkEmail).toHaveBeenCalledTimes(2);
    const calls = sendTeamInviteLinkEmail.mock.calls.map(
      (c) => c[0] as { to: string; inviteUrl: string; asCaptain?: boolean }
    );
    expect(calls.map((c) => c.to).sort()).toEqual([
      'cap@example.com',
      'p2@example.com',
    ]);
    expect(
      calls.every((c) => c.inviteUrl.includes('/invitation/'))
    ).toBe(true);
    // La capitaine désignée est invitée EN TANT QUE capitaine.
    expect(calls.find((c) => c.to === 'cap@example.com')!.asCaptain).toBe(true);

    // Le jeton n'est stocké que hashé, avec l'email visé pour la vérification
    // d'identité à l'ouverture du lien.
    const invites = (store.demandes as any[]).filter((d) => d.type === 'invite');
    expect(
      invites.every(
        (i) =>
          typeof i.payload.invite_token_hash === 'string' &&
          i.payload.invite_token_hash.length === 64
      )
    ).toBe(true);
    expect(invites.map((i) => i.payload.invite_email).sort()).toEqual([
      'cap@example.com',
      'p2@example.com',
    ]);
  });

  it("envoie le magic-link au manager, sans l'onboarding Battle.net", async () => {
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Managed Team',
          manager_email: 'mgr@example.com',
          members: [
            {
              email: 'cap@example.com',
              role: 'player',
              battle_tag: 'Cap#1234',
              set_captain: true,
            },
          ],
        },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    expect(sendTeamAccessEmail).toHaveBeenCalledTimes(1);
    const call = sendTeamAccessEmail.mock.calls[0][0] as {
      to: string;
      actionLink: string;
    };
    expect(call.to).toBe('mgr@example.com');
    expect(decodeURIComponent(call.actionLink)).toContain(
      'next=/player/manage-team'
    );
    expect(call.actionLink).not.toContain('welcome');
    // Le créateur ne reçoit pas AUSSI l'email « tu as rejoint l'équipe ».
    expect(sendTeamJoinEmail).not.toHaveBeenCalled();
    // L'email d'accès exposé au client est masqué.
    expect((res.body as any).accessEmail.sent).toBe(true);
    expect((res.body as any).accessEmail.to).toBe('m***@example.com');
  });

  it('accepte un roster sans capitaine désignée (elle sera désignée plus tard)', async () => {
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'No Captain Yet',
          manager_email: 'mgr@example.com',
          members: [
            {
              email: 'cap@example.com',
              role: 'player',
              battle_tag: 'Cap#1234',
            },
            { email: 'p2@example.com', role: 'player', battle_tag: 'P2#5678' },
          ],
        },
      }),
      res
    );

    // En mode capitaine, ce même payload renverrait 400 CAPTAIN_REQUIRED : le
    // manager suffit à piloter l'équipe et à inviter.
    expect(res.statusCode).toBe(201);
    expect((store.teams as any)[0].captain_id ?? null).toBeNull();
    const invites = (store.demandes as any[]).filter(
      (d) => d.type === 'invite' && d.status === 'pending'
    );
    expect(invites).toHaveLength(2);
    expect(invites.every((i) => i.payload.set_captain === undefined)).toBe(
      true
    );
  });

  it('400 MANAGER_DUPLICATE quand le manager figure aussi dans le roster', async () => {
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Dup Team',
          manager_email: 'cap@example.com',
          members: [
            {
              email: 'cap@example.com',
              role: 'player',
              battle_tag: 'Cap#1234',
              set_captain: true,
            },
          ],
        },
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('MANAGER_DUPLICATE');
    // Rejet AVANT toute création : aucune donnée orpheline.
    expect((store.teams as any[]) ?? []).toHaveLength(0);
    expect((store.team_members as any[]) ?? []).toHaveLength(0);
  });

  it('400 MANAGER_EMAIL_INVALID quand l’email du manager est mal formé', async () => {
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: { name: 'Bad Email', manager_email: 'pas-un-email' },
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('MANAGER_EMAIL_INVALID');
    expect((store.teams as any[]) ?? []).toHaveLength(0);
  });

  it("ne compte pas le manager comme joueuse pour min_players d'un tournoi", async () => {
    store.tournaments = [
      { id: 'tour-1', name: 'Cup', status: 'published', min_players: 1 },
    ] as any;
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Managed Signup',
          manager_email: 'mgr@example.com',
          tournament_id: 'tour-1',
          members: [
            {
              email: 'cap@example.com',
              role: 'player',
              battle_tag: 'Cap#1234',
              set_captain: true,
            },
          ],
        },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    // Le seul membre inséré est le manager : 0 joueuse CONFIRMÉE → pas
    // d'inscription directe. L'équipe ne prend donc aucune place dans le
    // tournoi tant que personne n'a accepté.
    expect((res.body as any).tournament).toBeUndefined();
    // …mais le roster DÉCLARÉ (1 invitation joueuse) atteint min_players : une
    // candidature part vers le staff plutôt que rien du tout.
    expect((res.body as any).tournament_application).toMatchObject({
      tournament_name: 'Cup',
    });
    const application = (store.demandes as any[]).find(
      (d) => d.type === 'team_registration'
    );
    expect(application).toMatchObject({
      status: 'pending',
      tournament_id: 'tour-1',
    });
    expect(application.payload).toMatchObject({
      auto_from_team_create: true,
      confirmed_players: 0,
      declared_players: 1,
    });
  });

  it('dépose une candidature même très loin de min_players', async () => {
    // Décision produit 2026-08-27 : la candidature n'exige aucun effectif
    // minimum. Une équipe d'une personne peut se déclarer ; le staff arbitre,
    // avec les deux décomptes sous les yeux. Le contraire — ce qui existait —
    // laissait l'équipe invisible du staff pendant toute sa constitution.
    store.tournaments = [
      { id: 'tour-1', name: 'Cup', status: 'published', min_players: 5 },
    ] as any;
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Too Small',
          manager_email: 'mgr@example.com',
          tournament_id: 'tour-1',
          members: [
            {
              email: 'cap@example.com',
              role: 'player',
              battle_tag: 'Cap#1234',
              set_captain: true,
            },
          ],
        },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    expect((res.body as any).tournament).toBeUndefined();
    expect((res.body as any).tournament_application).toMatchObject({
      tournament_name: 'Cup',
    });
    const application = (store.demandes as any[]).find(
      (d) => d.type === 'team_registration'
    );
    expect(application.payload).toMatchObject({
      confirmed_players: 0,
      declared_players: 1,
      min_players: 5,
    });
  });

  it('ne dépose aucune candidature quand le tournoi est complet', async () => {
    store.tournaments = [
      {
        id: 'tour-1',
        name: 'Cup',
        status: 'published',
        min_players: 1,
        max_teams: 1,
      },
    ] as any;
    // Une équipe occupe déjà l'unique place. Le handler lit la capacité via
    // `stage_teams` avec un embed PostgREST
    // (`tournament_stages!inner(tournament_id)`) que le mock ne sait pas
    // joindre : il compare littéralement la colonne filtrée. On seede donc la
    // clé sous sa forme pointée — c'est une contrainte du mock, pas du schéma.
    store.tournament_stages = [
      { id: 'stage-1', tournament_id: 'tour-1' },
    ] as any;
    store.stage_teams = [
      {
        id: 'st-1',
        stage_id: 'stage-1',
        team_id: 'other-team',
        'tournament_stages.tournament_id': 'tour-1',
      },
    ] as any;

    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Late Comer',
          manager_email: 'mgr@example.com',
          tournament_id: 'tour-1',
          members: [
            {
              email: 'cap@example.com',
              role: 'player',
              battle_tag: 'Cap#1234',
              set_captain: true,
            },
          ],
        },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    expect((res.body as any).tournament).toBeUndefined();
    expect((res.body as any).tournament_application).toBeUndefined();
  });
});
