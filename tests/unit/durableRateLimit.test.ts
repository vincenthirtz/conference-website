// tests/unit/durableRateLimit.test.ts
//
// Couvre le limiteur DURABLE `consumeDurableRateLimit` : autorise quand le RPC
// renvoie true, bloque quand il renvoie false, et FAIL-OPEN (autorise) quand le
// RPC erre / est absent.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin };
});

import { resetSupabaseMock, setRpcResult } from './__helpers__/supabaseMock';
import { consumeDurableRateLimit } from '../../utils/durableRateLimit';

beforeEach(() => {
  resetSupabaseMock();
});

describe('consumeDurableRateLimit', () => {
  it('autorise quand le RPC renvoie true', async () => {
    setRpcResult('consume_rate_limit', { data: true });
    await expect(
      consumeDurableRateLimit('publicv1:x:1.2.3.4', 60, 120)
    ).resolves.toBe(true);
  });

  it('bloque quand le RPC renvoie false', async () => {
    setRpcResult('consume_rate_limit', { data: false });
    await expect(
      consumeDurableRateLimit('publicv1:x:1.2.3.4', 60, 120)
    ).resolves.toBe(false);
  });

  it('fail-open (autorise) quand le RPC erre', async () => {
    setRpcResult('consume_rate_limit', {
      error: { message: 'function does not exist' },
    });
    await expect(
      consumeDurableRateLimit('publicv1:x:1.2.3.4', 60, 120)
    ).resolves.toBe(true);
  });

  it('fail-open (autorise) quand le RPC est absent / non seedé (data null)', async () => {
    await expect(
      consumeDurableRateLimit('publicv1:x:1.2.3.4', 60, 120)
    ).resolves.toBe(true);
  });
});
