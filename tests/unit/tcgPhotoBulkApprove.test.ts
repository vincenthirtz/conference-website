// tests/unit/tcgPhotoBulkApprove.test.ts
//
// Validation groupée des photos TCG (`approveSequentially`) : une décision
// unitaire par photo avec le `photoPath` affiché, conflits (409) sautés sans
// arrêter le lot, toute autre erreur arrête le lot, plafond par lot.

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/components/admin/tcg/tcgGrantForm', () => ({
  adminUserLabel: (u: { id: string }) => u.id,
}));

import {
  approveSequentially,
  BULK_APPROVE_MAX,
  type PendingPhoto,
} from '../../components/admin/moderation/tcgPhotoQueue';

function photo(userId: string, photoPath: string | null = `${userId}.webp`) {
  return {
    userId,
    displayName: null,
    email: null,
    photoPath,
    photoUrl: null,
    submittedAt: null,
    hasPlayerProfile: true,
  } satisfies PendingPhoto;
}

class Conflict extends Error {}

describe('approveSequentially', () => {
  it('approuve chaque photo avec son chemin affiché, dans l’ordre', async () => {
    const calls: string[] = [];
    const out = await approveSequentially(
      [photo('a'), photo('b')],
      async (p) => {
        calls.push(`${p.userId}:${p.photoPath}`);
      },
      () => false
    );
    expect(calls).toEqual(['a:a.webp', 'b:b.webp']);
    expect(out).toEqual({ approved: ['a', 'b'], skipped: [], stopped: false });
  });

  it('saute un conflit (409) et une photo sans chemin, sans arrêter le lot', async () => {
    const out = await approveSequentially(
      [photo('a'), photo('nopath', null), photo('b')],
      async (p) => {
        if (p.userId === 'a') throw new Conflict('409');
      },
      (err) => err instanceof Conflict
    );
    expect(out.approved).toEqual(['b']);
    expect(out.skipped).toEqual(['a', 'nopath']);
    expect(out.stopped).toBe(false);
  });

  it('s’arrête sur une autre erreur (429, 5xx)', async () => {
    const approve = vi.fn(async (p: { userId: string }) => {
      if (p.userId === 'b') throw new Error('429');
    });
    const out = await approveSequentially(
      [photo('a'), photo('b'), photo('c')],
      approve,
      () => false
    );
    expect(out).toEqual({ approved: ['a'], skipped: [], stopped: true });
    expect(approve).toHaveBeenCalledTimes(2);
  });

  it('plafonne le lot', async () => {
    const many = Array.from({ length: BULK_APPROVE_MAX + 5 }, (_, i) =>
      photo(`u${i}`)
    );
    const approve = vi.fn(async () => undefined);
    const out = await approveSequentially(many, approve, () => false);
    expect(approve).toHaveBeenCalledTimes(BULK_APPROVE_MAX);
    expect(out.approved).toHaveLength(BULK_APPROVE_MAX);
  });
});
