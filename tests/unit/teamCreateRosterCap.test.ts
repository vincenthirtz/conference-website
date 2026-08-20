// Plafond de roster à la création d'équipe : il porte sur les JOUEUSES.
//
// Le symptôme signalé (2026-08-20) : sur l'étape « roster » du wizard, un
// manager ne pouvait pas déclarer un coach et un encadrant de plus — « blocage
// roster 5 personnes ». Le wizard, lui, appliquait déjà la bonne règle et
// laissait saisir les lignes : c'est le SERVEUR qui comptait les lignes au lieu
// des joueuses (`cleanedMembers.length > 5`). L'utilisateur voyait donc un
// formulaire valide refusé à l'envoi.
//
// La règle est partout ailleurs la même — `countPlayingMembers`, et le trigger
// `enforce_team_max_players` en base exempte explicitement coach et manager.
// Ce test la fixe aussi à la porte d'entrée publique.
//
// Cible : pages/api/teams/create-with-member.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  sendTeamJoinEmail,
  sendWelcomeEmail,
  sendTeamAccessEmail,
  sendTeamInviteLinkEmail,
} = vi.hoisted(() => ({
  sendTeamJoinEmail: vi.fn(async () => undefined),
  sendWelcomeEmail: vi.fn(async () => ({ success: true as const })),
  sendTeamAccessEmail: vi.fn(async () => ({ success: true as const })),
  sendTeamInviteLinkEmail: vi.fn(async () => ({ success: true as const })),
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
  const { token } = generateChallenge();
  const decoded = JSON.parse(
    Buffer.from(token.split('.')[0], 'base64url').toString()
  ) as { answer: number };
  return { captchaToken: token, captchaAnswer: String(decoded.answer) };
}

function makeReq(over: Partial<any> = {}): any {
  const { body: overBody, ...rest } = over;
  return {
    method: 'POST',
    headers: { host: 'h' },
    query: {},
    ...rest,
    body: { ...validCaptcha(), ...(overBody ?? {}) },
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

/** `count` joueuses, la première désignée capitaine. */
function players(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    email: `p${i}@example.com`,
    role: 'player',
    battle_tag: `P${i}#1234`,
    set_captain: i === 0,
  }));
}

const ALL_EMAILS = [
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `u-p${i}`,
    email: `p${i}@example.com`,
  })),
  { id: 'u-coach', email: 'coach@example.com' },
  { id: 'u-staff', email: 'staff@example.com' },
  { id: 'u-mgr', email: 'mgr@example.com' },
];

beforeEach(() => {
  resetSupabaseMock();
  store.teams = [];
  store.team_members = [];
  store.demandes = [];
  setAuthListUsers(ALL_EMAILS);
});

describe('le plafond compte les joueuses, pas les lignes', () => {
  it('accepte 5 joueuses + un coach + un manager — le cas signalé', async () => {
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Roster Complet',
          manager_email: 'mgr@example.com',
          members: [
            ...players(5),
            { email: 'coach@example.com', role: 'coach' },
            { email: 'staff@example.com', role: 'manager' },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
  });

  it('refuse toujours 6 JOUEUSES', async () => {
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({ body: { name: 'Trop', members: players(6) } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: 'TOO_MANY_MEMBERS' });
  });

  it('un coach ne consomme pas la place d’une joueuse', async () => {
    // 5 joueuses = plein. Ajouter un coach ne doit RIEN changer : c'est
    // exactement ce que le compte de lignes cassait.
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Cinq Plus Coach',
          members: [
            ...players(5),
            { email: 'coach@example.com', role: 'coach' },
          ],
        },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
  });

  it('garde un plafond ABSOLU de lignes — l’endroit est public', async () => {
    // « L'encadrement ne compte pas » ne doit pas devenir un vecteur d'abus :
    // chaque email reçu peut créer un compte auth.
    const res = makeRes();
    await createWithMemberHandler(
      makeReq({
        body: {
          name: 'Abus',
          members: Array.from({ length: 11 }, (_, i) => ({
            email: `coach${i}@example.com`,
            role: 'coach',
          })),
        },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: 'TOO_MANY_MEMBERS' });
  });
});
