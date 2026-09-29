// tests/unit/tcgPacksWalletReadError.test.ts
//
// ERREUR DE LECTURE ≠ SOLDE 0 (lot P14). `GET /api/player/tcg/packs` lisait le
// solde en cache et, sur une erreur de lecture, rendait `balance: 0` : l'écran
// annonçait une perte qui n'avait pas eu lieu. Le service répond désormais
// 500 ; l'ABSENCE de porte-monnaie reste un solde nul (rien gagné encore).

import { describe, expect, it, vi } from 'vitest';

const wallet = vi.hoisted(() => ({
  reply: { balance: null as number | null, error: null as unknown },
}));

vi.mock('../../features/player/tcg/repository/core', () => ({
  readPacksPage: async () => ({ rows: [], error: null }),
  readWalletBalance: async () => wallet.reply,
  countUnopenedPacks: async () => ({ count: 0, error: null }),
  readTwitchTcgRewardId: async () => ({ rewardId: null, error: null }),
}));

import { listPacks } from '../../features/player/tcg/service/packs';
import { AdminError } from '../../utils/admin/errors';

const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as never;
const ctx = {
  db: {} as never,
  tenantId: '0b5f1c3e-7a2d-4c1b-9e8f-1a2b3c4d5e6f',
  userId: '4f1c2a7e-0b6d-4e3a-9c1f-2a3b4c5d6e7f',
  logger,
};

describe('GET /api/player/tcg/packs — solde illisible', () => {
  it('refuse (500) au lieu d’annoncer un solde à 0', async () => {
    wallet.reply = { balance: null, error: { message: 'timeout' } };
    const err = await listPacks(ctx, {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdminError);
    expect((err as AdminError).status).toBe(500);
  });

  it('sans porte-monnaie (aucune ligne), le solde est bien nul', async () => {
    wallet.reply = { balance: null, error: null };
    const out = await listPacks(ctx, {});
    expect(out.balance).toBe(0);
  });

  it('rend le solde lu', async () => {
    wallet.reply = { balance: 240, error: null };
    const out = await listPacks(ctx, { status: 'unopened' });
    expect(out.balance).toBe(240);
  });
});
