// tests/unit/pushSubscriptionUpsert.test.ts
//
// La branche de COURSE de utils/pushSubscriptionUpsert.ts, que les suites des
// routes (store en mémoire, sans contrainte d'unicité) ne savent pas atteindre :
// lecture « rien », INSERT refusé en 23505 parce qu'une ligne vient d'arriver.
//
// Ce qui compte : la ligne concurrente passe par la MÊME garde de propriété.
// Un simple UPDATE par endpoint dans cette branche — ce que faisait la route
// admin — laisserait un attaquant qui provoque la course s'attribuer l'appareil.

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  lookups: [] as Array<Row | null>,
  insertError: null as { code: string } | null,
  updates: [] as Array<{ patch: Row; filters: Array<[string, unknown]> }>,
  updateResult: { id: 'sub-1', endpoint: 'https://push.example.test/e' } as Row,
}));

vi.mock('@/utils/supabase', () => {
  function from() {
    const filters: Array<[string, unknown]> = [];
    let mode: 'select' | 'insert' | 'update' = 'select';
    let patch: Row = {};
    const builder: any = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        filters.push([col, val]);
        return builder;
      },
      insert: () => {
        mode = 'insert';
        return builder;
      },
      update: (p: Row) => {
        mode = 'update';
        patch = p;
        return builder;
      },
      maybeSingle: async () => {
        if (mode === 'insert') return { data: null, error: state.insertError };
        if (mode === 'update') {
          state.updates.push({ patch, filters });
          return { data: state.updateResult, error: null };
        }
        return { data: state.lookups.shift() ?? null, error: null };
      },
    };
    return builder;
  }
  return { supabaseAdmin: { from } };
});

import {
  sameSecret,
  upsertPushSubscription,
} from '@/utils/pushSubscriptionUpsert';

const ME = 'user-me';
const VICTIM = 'user-victim';
const subscription = {
  endpoint: 'https://push.example.test/e',
  keys: { p256dh: 'pk-mine', auth: 'auth-mine' },
};

const call = () =>
  upsertPushSubscription({
    authUserId: ME,
    subscription,
    userAgent: null,
    logTag: '[test]',
  });

beforeEach(() => {
  state.lookups = [];
  state.insertError = { code: '23505' };
  state.updates = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('upsertPushSubscription — course à l’INSERT (23505)', () => {
  it('409 sans écrire quand la ligne concurrente appartient à un autre compte avec d’autres clés', async () => {
    state.lookups = [
      null,
      { id: 'sub-1', user_id: VICTIM, p256dh: 'pk-victim', auth: 'auth-v' },
    ];
    const result = await call();
    expect(result.status).toBe(409);
    expect((result.body as { code?: string }).code).toBe(
      'SUBSCRIPTION_OWNED_BY_OTHER_USER'
    );
    expect(state.updates).toEqual([]);
  });

  it('200 quand la ligne concurrente porte les mêmes clés (même navigateur)', async () => {
    state.lookups = [
      null,
      { id: 'sub-1', user_id: VICTIM, p256dh: 'pk-mine', auth: 'auth-mine' },
    ];
    const result = await call();
    expect(result.status).toBe(200);
    expect(state.updates).toHaveLength(1);
    // L'UPDATE re-filtre sur les clés vérifiées : une ligne modifiée entre
    // lecture et écriture ne serait pas écrasée.
    expect(state.updates[0].filters).toEqual(
      expect.arrayContaining([
        ['p256dh', 'pk-mine'],
        ['auth', 'auth-mine'],
      ])
    );
    expect(state.updates[0].patch.user_id).toBe(ME);
  });

  it('500 si la ligne concurrente est introuvable à la relecture', async () => {
    state.lookups = [null, null];
    expect((await call()).status).toBe(500);
    expect(state.updates).toEqual([]);
  });
});

describe('sameSecret', () => {
  it('compare valeur et longueur, refuse une valeur absente', () => {
    expect(sameSecret('abc', 'abc')).toBe(true);
    expect(sameSecret('abc', 'abd')).toBe(false);
    expect(sameSecret('abc', 'abcd')).toBe(false);
    expect(sameSecret(null, 'abc')).toBe(false);
  });
});
