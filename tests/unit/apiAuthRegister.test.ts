import { describe, it, expect, vi, beforeEach } from 'vitest';

// La route utilise `supabaseAnonServer` (signUp) + `supabaseAdmin` (check
// blacklist fire-and-forget via alertIfBlacklisted) de @/utils/supabase.
vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return {
    supabaseAnonServer: m.supabaseAnonServer,
    supabaseAdmin: m.supabaseAdmin,
  };
});

import {
  resetSupabaseMock,
  setSignUpResult,
  signUpCalls,
} from './__helpers__/supabaseMock';

import registerHandler from '../../pages/api/auth/register';

// NB : le rate-limit (applyRateLimit) est neutralisé globalement dans les tests
// unitaires (cf. tests/unit/__helpers__/testSetup.ts), donc non testable ici.
function makeReq(over: Partial<any> = {}): any {
  const { headers: overHeaders, ...rest } = over;
  return {
    method: 'POST',
    query: {},
    body: {},
    ...rest,
    headers: { host: 'h', ...(overHeaders || {}) },
  };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

const validBody = {
  email: 'New@Example.com',
  password: 'motdepasse8',
  displayName: '  Alice  ',
  battleTag: 'Alice#1234',
};

beforeEach(() => {
  resetSupabaseMock();
});

describe('/api/auth/register', () => {
  it('405 sur méthode non-POST', async () => {
    const res = makeRes();
    await registerHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });

  it('400 quand l’email est invalide', async () => {
    const res = makeRes();
    await registerHandler(
      makeReq({ body: { ...validBody, email: 'pas-un-email' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
  });

  it('400 quand le mot de passe fait moins de 8 caractères', async () => {
    const res = makeRes();
    await registerHandler(
      makeReq({ body: { ...validBody, password: 'court' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
  });

  it('400 quand le BattleTag est au mauvais format', async () => {
    const res = makeRes();
    await registerHandler(
      makeReq({ body: { ...validBody, battleTag: 'SansDiese' } }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 et signUp avec rôle forcé player + email normalisé', async () => {
    const res = makeRes();
    // Tentative d'injecter un rôle privilégié : doit être ignorée.
    await registerHandler(
      makeReq({ body: { ...validBody, role: 'owner' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');

    expect(signUpCalls).toHaveLength(1);
    const call = signUpCalls[0];
    expect(call.email).toBe('new@example.com'); // trim + lowercase
    expect(call.password).toBe('motdepasse8'); // jamais trimmé
    expect(call.options?.data?.role).toBe('player'); // forcé serveur
    expect(call.options?.data?.display_name).toBe('Alice'); // trim
    expect(call.options?.data?.battle_tag).toBe('Alice#1234');
  });

  it('champs optionnels vides → null en metadata', async () => {
    const res = makeRes();
    await registerHandler(
      makeReq({
        body: {
          email: 'solo@example.com',
          password: 'motdepasse8',
          displayName: '   ',
          battleTag: '',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(signUpCalls[0].options?.data?.display_name).toBeNull();
    expect(signUpCalls[0].options?.data?.battle_tag).toBeNull();
  });

  it('anti-énumération : email déjà pris → 200 neutre (pas de fuite)', async () => {
    setSignUpResult({
      data: { user: null },
      error: { message: 'User already registered' },
    });
    const res = makeRes();
    await registerHandler(makeReq({ body: validBody }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.error).toBeUndefined();
  });

  it('429 quand Supabase signale un rate-limit', async () => {
    setSignUpResult({
      data: { user: null },
      error: { status: 429, message: 'email rate limit exceeded' },
    });
    const res = makeRes();
    await registerHandler(makeReq({ body: validBody }), res);
    expect(res.statusCode).toBe(429);
    expect(res.body.code).toBe('RATE_LIMIT');
  });

  it('500 sur erreur Supabase inattendue', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setSignUpResult({
      data: { user: null },
      error: { message: 'unexpected database failure' },
    });
    const res = makeRes();
    await registerHandler(makeReq({ body: validBody }), res);
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('SERVER');
  });

  it('ne tronque pas le mot de passe (espaces significatifs préservés)', async () => {
    const res = makeRes();
    const pwd = '  mot de passe  ';
    await registerHandler(
      makeReq({ body: { ...validBody, password: pwd } }),
      res
    );
    expect(res.statusCode).toBe(200);
    // Le mot de passe doit partir tel quel à Supabase : pas de .trim().
    expect(signUpCalls[0].password).toBe(pwd);
  });
});
