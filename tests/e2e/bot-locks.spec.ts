// tests/e2e/bot-locks.spec.ts
// Couvre P1-D : table bot_locks + POST /api/bot/v1/locks/[name].
//
// Garanties testées :
//   - 1er claim : 201 acquired=true
//   - 2e claim avec autre holder : 200 acquired=false + currentHolder
//   - claim avec MÊME holder : 200 acquired=true (renouvellement)
//   - release : ne marche que pour le bon holder
//   - lock expiré : un autre holder peut reprendre

import { test, expect } from '@playwright/test';
import { supabaseTestClient } from '../utils/supabaseTestClient';

const API_KEY = process.env.BOT_API_KEY;
const HAS_KEY = Boolean(API_KEY);
const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();

test.describe.serial('Bot distributed locks (P1-D)', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  const lockName = `e2e-lock-${TS}`;
  const holderA = `bot-a-${TS}`;
  const holderB = `bot-b-${TS}`;

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    await supabaseTestClient.from('bot_locks').delete().eq('name', lockName);
  });

  test('claim sur lock libre → 201 acquired=true', async ({ request }) => {
    const res = await request.post(`/api/bot/v1/locks/${lockName}`, {
      headers: { 'x-api-key': API_KEY! },
      data: { holder: holderA, ttlSeconds: 60, action: 'claim' },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).acquired).toBe(true);
  });

  test('claim concurrent (autre holder) → 200 acquired=false', async ({
    request,
  }) => {
    const res = await request.post(`/api/bot/v1/locks/${lockName}`, {
      headers: { 'x-api-key': API_KEY! },
      data: { holder: holderB, ttlSeconds: 60, action: 'claim' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.acquired).toBe(false);
    expect(body.currentHolder).toBe(holderA);
  });

  test('claim renouvellement (même holder) → 200 acquired=true', async ({
    request,
  }) => {
    const res = await request.post(`/api/bot/v1/locks/${lockName}`, {
      headers: { 'x-api-key': API_KEY! },
      data: { holder: holderA, ttlSeconds: 120, action: 'claim' },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).acquired).toBe(true);
  });

  test('release par mauvais holder → no-op + lock toujours actif', async ({
    request,
  }) => {
    await request.post(`/api/bot/v1/locks/${lockName}`, {
      headers: { 'x-api-key': API_KEY! },
      data: { holder: holderB, action: 'release' },
    });

    // Le lock doit toujours appartenir à holderA.
    const { data } = await supabaseTestClient!
      .from('bot_locks')
      .select('holder')
      .eq('name', lockName)
      .single();
    expect(data!.holder).toBe(holderA);
  });

  test('release par bon holder → row supprimée', async ({ request }) => {
    const res = await request.post(`/api/bot/v1/locks/${lockName}`, {
      headers: { 'x-api-key': API_KEY! },
      data: { holder: holderA, action: 'release' },
    });
    expect(res.status()).toBe(200);

    const { data } = await supabaseTestClient!
      .from('bot_locks')
      .select('name')
      .eq('name', lockName);
    expect(data).toHaveLength(0);
  });

  test('lock expiré → un autre holder peut reprendre', async ({ request }) => {
    // Force un lock expiré directement en DB
    await supabaseTestClient!.from('bot_locks').insert({
      name: lockName,
      holder: holderA,
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });

    const res = await request.post(`/api/bot/v1/locks/${lockName}`, {
      headers: { 'x-api-key': API_KEY! },
      data: { holder: holderB, ttlSeconds: 60, action: 'claim' },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).acquired).toBe(true);

    const { data } = await supabaseTestClient!
      .from('bot_locks')
      .select('holder')
      .eq('name', lockName)
      .single();
    expect(data!.holder).toBe(holderB);
  });
});
