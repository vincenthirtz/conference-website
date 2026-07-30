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
//   - le manager ne compte pas comme joueuse pour `min_players` (inscription
//     tournoi refusée plutôt que validée avec un roster vide)

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { sendTeamJoinEmail, sendWelcomeEmail, sendTeamAccessEmail } = vi.hoisted(
  () => ({
    sendTeamJoinEmail: vi.fn(async () => undefined),
    sendWelcomeEmail: vi.fn(async () => ({ success: true as const })),
    sendTeamAccessEmail: vi.fn(
      async (_input: { to: string; teamName: string; actionLink: string }) => ({
        success: true as const,
      })
    ),
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
    // Le seul membre inséré est le manager : 0 joueuse → pas d'inscription auto
    // (les joueuses doivent d'abord accepter leur invitation).
    expect((res.body as any).tournament).toBeUndefined();
  });
});
