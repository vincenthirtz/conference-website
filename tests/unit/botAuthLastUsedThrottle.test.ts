// tests/unit/botAuthLastUsedThrottle.test.ts
//
// `tenant_secrets.last_used_at` n'est plus réécrit à chaque miss du cache
// d'authentification : le bot appelle toutes les ~60 s, soit le TTL du cache,
// et chaque appel payait une écriture (1 621 PATCH/jour mesurés). On n'écrit
// plus que si la valeur lue a plus d'une heure.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetSupabaseMock,
  seedBotAuth,
  BOT_TEST_API_KEY,
  store,
} from './__helpers__/supabaseMock';
import {
  verifyBotApiKeyMultiTenant,
  shouldBumpLastUsed,
  LAST_USED_WRITE_INTERVAL_MS,
  __resetBotImpersonationCachesForTests,
} from '../../utils/botAuth';

function req(): any {
  return { method: 'GET', headers: { 'x-api-key': BOT_TEST_API_KEY } };
}

/** Laisse la promesse fire-and-forget de l'update se résoudre. */
async function flush() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

describe('shouldBumpLastUsed()', () => {
  const now = Date.parse('2026-10-06T12:00:00Z');

  it('écrit si la valeur est absente ou illisible', () => {
    expect(shouldBumpLastUsed(null, now)).toBe(true);
    expect(shouldBumpLastUsed(undefined, now)).toBe(true);
    expect(shouldBumpLastUsed('pas une date', now)).toBe(true);
  });

  it("n'écrit pas tant que la dernière trace a moins d'une heure", () => {
    const recent = new Date(now - 10 * 60_000).toISOString();
    expect(shouldBumpLastUsed(recent, now)).toBe(false);
  });

  it('écrit dès que la dernière trace a une heure ou plus', () => {
    const old = new Date(now - LAST_USED_WRITE_INTERVAL_MS).toISOString();
    expect(shouldBumpLastUsed(old, now)).toBe(true);
  });
});

describe('verifyBotApiKeyMultiTenant — trace last_used_at', () => {
  beforeEach(() => {
    resetSupabaseMock();
    __resetBotImpersonationCachesForTests();
    seedBotAuth();
  });

  it('ne réécrit pas une trace récente (miss de cache compris)', async () => {
    const recent = new Date(Date.now() - 5 * 60_000).toISOString();
    (store.tenant_secrets as any[])[0].last_used_at = recent;

    const out = await verifyBotApiKeyMultiTenant(req());
    await flush();

    expect(out.ok).toBe(true);
    expect((store.tenant_secrets as any[])[0].last_used_at).toBe(recent);
  });

  it('rafraîchit une trace de plus d’une heure', async () => {
    const old = new Date(Date.now() - 2 * 3_600_000).toISOString();
    (store.tenant_secrets as any[])[0].last_used_at = old;

    const out = await verifyBotApiKeyMultiTenant(req());
    await flush();

    expect(out.ok).toBe(true);
    const after = (store.tenant_secrets as any[])[0].last_used_at;
    expect(after).not.toBe(old);
    expect(Date.parse(after)).toBeGreaterThan(Date.parse(old));
  });

  it('écrit la première trace quand il n’y en a pas', async () => {
    const out = await verifyBotApiKeyMultiTenant(req());
    await flush();

    expect(out.ok).toBe(true);
    expect(typeof (store.tenant_secrets as any[])[0].last_used_at).toBe(
      'string'
    );
  });
});
