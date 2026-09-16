// tests/unit/freePlayerClaim.test.ts
//
// Le rattachement d'une fiche « joueuse libre » à un compte.
//
// CE QUI MÉRITE UN TEST ICI n'est pas le chemin heureux, c'est ce que la
// fonction REFUSE de faire : réécrire une fiche déjà rattachée (elle
// appartiendrait alors à quelqu'un d'autre), rapprocher sans preuve, ou faire
// échouer son appelant. Les trois sont des promesses de l'en-tête, et aucune ne
// se voit à la lecture du chemin heureux.

import { beforeEach, describe, expect, it, vi } from 'vitest';

type UpdateCall = { column: string; value: string };

const calls: UpdateCall[] = [];
let failNext = false;

vi.mock('@/utils/supabase', () => {
  const builder = () => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      update: self,
      eq: (column: string, value: string) => {
        if (column !== 'tenant_id') calls.push({ column, value });
        return chain;
      },
      is: self,
      ilike: (column: string, value: string) => {
        calls.push({ column, value });
        return chain;
      },
      select: () =>
        failNext
          ? Promise.resolve({ data: null, error: { message: 'boom' } })
          : Promise.resolve({ data: [{ id: 'row-1' }], error: null }),
    });
    return chain;
  };
  return { supabaseAdmin: { from: builder } };
});

vi.mock('@/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { claimFreePlayerRows } = await import(
  '@/utils/freePlayers/claimForAccount'
);

describe('claimFreePlayerRows', () => {
  beforeEach(() => {
    calls.length = 0;
    failNext = false;
  });

  it('ne rapproche RIEN sans preuve — ni email, ni Discord', async () => {
    const res = await claimFreePlayerRows({
      tenantId: 't',
      authUserId: 'u',
    });
    expect(res.claimed).toBe(0);
    expect(calls, 'aucune écriture ne doit partir').toEqual([]);
  });

  it('ne rapproche rien sans espace ni compte', async () => {
    expect(
      (await claimFreePlayerRows({ tenantId: '', authUserId: 'u' })).claimed
    ).toBe(0);
    expect(
      (await claimFreePlayerRows({ tenantId: 't', authUserId: '' })).claimed
    ).toBe(0);
    expect(calls).toEqual([]);
  });

  it('normalise l’email : une casse différente reste la même personne', async () => {
    await claimFreePlayerRows({
      tenantId: 't',
      authUserId: 'u',
      email: '  Aru@Example.COM ',
    });
    expect(calls).toContainEqual({
      column: 'contact_email',
      value: 'aru@example.com',
    });
  });

  it('cherche sur les DEUX clés quand les deux sont connues', async () => {
    const res = await claimFreePlayerRows({
      tenantId: 't',
      authUserId: 'u',
      email: 'a@b.c',
      discordUserId: '1234',
    });
    expect(calls.map((c) => c.column)).toEqual([
      'contact_email',
      'discord_user_id',
    ]);
    // Une ligne par passe dans ce double : le total s'additionne.
    expect(res.claimed).toBe(2);
  });

  it('une lecture en échec ne LÈVE pas — l’appelant ne doit rien perdre', async () => {
    failNext = true;
    const res = await claimFreePlayerRows({
      tenantId: 't',
      authUserId: 'u',
      email: 'a@b.c',
    });
    expect(res.claimed).toBe(0);
  });
});
