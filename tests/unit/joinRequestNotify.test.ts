// tests/unit/joinRequestNotify.test.ts
//
// Candidature pour rejoindre une équipe (POST /api/demandes/join) → email à la
// capitaine, via utils/joinRequestNotify.ts.
//
// Deux garanties, les seules qui comptent :
//   1. l'email part vers la BONNE destinataire (la capitaine de l'équipe visée,
//      pas la candidate) avec de quoi décider ;
//   2. une notification qui échoue — envoi rejeté, ou module qui throw — ne
//      change RIEN à la réponse : la candidature est déjà enregistrée.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { sendJoinRequestEmail } = vi.hoisted(() => ({
  sendJoinRequestEmail: vi.fn(async (_opts: Record<string, unknown>) => ({
    success: true,
  })),
}));
vi.mock('@/utils/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/email')>();
  return { ...actual, sendJoinRequestEmail };
});

// Interrupteur pour simuler un orchestrateur qui rejette malgré ses gardes :
// c'est le `.catch` de la route qui est alors sous test, pas le try interne.
const { notifyControl } = vi.hoisted(() => ({
  notifyControl: { reject: false },
}));
vi.mock('@/utils/joinRequestNotify', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../utils/joinRequestNotify')>();
  return {
    ...actual,
    notifyJoinRequest: vi.fn(async (opts: any) => {
      if (notifyControl.reject) throw new Error('notify boom');
      return actual.notifyJoinRequest(opts);
    }),
  };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  setAdminUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';

import { notifyJoinRequest } from '../../utils/joinRequestNotify';
import demandesJoinHandler from '../../pages/api/demandes/join';

const TEAM = '550e8400-e29b-41d4-a716-446655440e01';

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

// Laisse les envois fire-and-forget se résoudre avant d'asserter.
async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

let _tok = 0;
function makeReq(body: Record<string, unknown>): any {
  _tok += 1;
  return {
    method: 'POST',
    headers: { host: 'h', authorization: `Bearer jr-${Date.now()}-${_tok}` },
    query: {},
    body,
  };
}

function seedTeam(captainId: string | null) {
  store.teams = [
    {
      id: TEAM,
      name: 'Les Phénix',
      captain_id: captainId,
      is_active: true,
      is_joinable: true,
    },
  ] as any;
  store.demandes = [];
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  sendJoinRequestEmail.mockReset();
  sendJoinRequestEmail.mockImplementation(async () => ({ success: true }));
  notifyControl.reject = false;
  setAuthUser({
    id: 'candidate-user',
    email: 'candidate@example.com',
    user_metadata: { display_name: 'Candidate', battle_tag: 'Cand#1234' },
  });
});

describe('POST /api/demandes/join — email à la capitaine', () => {
  it("envoie l'email à la capitaine de l'équipe visée, pas à la candidate", async () => {
    seedTeam('captain-user');
    setAdminUser('captain-user', 'captain@phenix.gg');

    const res = makeRes();
    await demandesJoinHandler(
      makeReq({ teamId: TEAM, message: 'Coucou', desiredRole: 'substitute' }),
      res
    );
    expect(res.statusCode).toBe(201);

    await flush();

    expect(sendJoinRequestEmail).toHaveBeenCalledTimes(1);
    const arg = sendJoinRequestEmail.mock.calls[0][0] as any;
    expect(arg.to).toBe('captain@phenix.gg');
    expect(arg.to).not.toBe('candidate@example.com');
    expect(arg.recipientTeamName).toBe('Les Phénix');
    expect(arg.playerName).toBe('Candidate');
    expect(arg.battleTag).toBe('Cand#1234');
    expect(arg.desiredRole).toBe('substitute');
    expect(arg.message).toBe('Coucou');
    // Le CTA mène là où la candidature se traite.
    expect(arg.ctaUrl).toMatch(/\/player\/manage-team$/);
  });

  it("équipe sans capitaine : 201, aucun email, pas d'erreur", async () => {
    seedTeam(null);

    const res = makeRes();
    await demandesJoinHandler(makeReq({ teamId: TEAM }), res);
    expect(res.statusCode).toBe(201);

    await flush();
    expect(sendJoinRequestEmail).not.toHaveBeenCalled();
  });

  it("un envoi d'email qui rejette ne change pas la réponse", async () => {
    seedTeam('captain-user');
    setAdminUser('captain-user', 'captain@phenix.gg');
    sendJoinRequestEmail.mockImplementation(async () => {
      throw new Error('Brevo down');
    });

    const res = makeRes();
    await demandesJoinHandler(makeReq({ teamId: TEAM }), res);
    await flush();

    expect(res.statusCode).toBe(201);
    expect((res.body as any).success).toBe(true);
    expect(sendJoinRequestEmail).toHaveBeenCalledTimes(1);
  });

  it('un orchestrateur qui rejette ne change pas la réponse', async () => {
    seedTeam('captain-user');
    setAdminUser('captain-user', 'captain@phenix.gg');
    notifyControl.reject = true;

    const res = makeRes();
    await demandesJoinHandler(makeReq({ teamId: TEAM }), res);
    await flush();

    expect(res.statusCode).toBe(201);
    expect((res.body as any).success).toBe(true);
    expect((res.body as any).demande).toBeTruthy();
    // Garde du test lui-même : la route a bien appelé l'orchestrateur piégé.
    expect(notifyJoinRequest).toHaveBeenCalled();
  });
});
