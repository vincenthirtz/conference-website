// tests/e2e/bot-event-ack-persist.spec.ts
// Couvre P1-C : persistance des event acks côté API (table
// discord_event_ack) via POST /api/bot/v1/events/handled.
//
// Garanties testées :
//   - 1er POST avec eventId X → 201 wasNew=true
//   - 2e POST avec même eventId → 200 wasNew=false
//   - eventId invalide → 400
//   - sans api key → 401
//   - source optionnelle persistée

import { test, expect } from '@playwright/test';
import {
  supabaseTestClient,
} from '../utils/supabaseTestClient';
import crypto from 'crypto';

const API_KEY = process.env.BOT_API_KEY;
const HAS_KEY = Boolean(API_KEY);
const HAS_SUPABASE = Boolean(supabaseTestClient);

test.describe.serial('Bot events handled (P1-C persistance ack)', () => {
  test.skip(!HAS_KEY || !HAS_SUPABASE, 'BOT_API_KEY ou Supabase manquant');

  const createdEventIds: string[] = [];

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    if (createdEventIds.length > 0) {
      await supabaseTestClient
        .from('discord_event_ack')
        .delete()
        .in('event_id', createdEventIds);
    }
  });

  test('1er POST avec un nouvel eventId → 201 wasNew=true + row en DB', async ({
    request,
  }) => {
    const eventId = crypto.randomUUID();
    createdEventIds.push(eventId);

    const res = await request.post('/api/bot/v1/events/handled', {
      headers: { 'x-api-key': API_KEY! },
      data: { eventId, source: 'webhook' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.wasNew).toBe(true);
    expect(body.handledAt).toBeTruthy();

    const { data } = await supabaseTestClient!
      .from('discord_event_ack')
      .select('event_id, source')
      .eq('event_id', eventId)
      .single();
    expect(data!.event_id).toBe(eventId);
    expect(data!.source).toBe('webhook');
  });

  test('2e POST avec le même eventId → 200 wasNew=false', async ({
    request,
  }) => {
    const eventId = crypto.randomUUID();
    createdEventIds.push(eventId);

    const r1 = await request.post('/api/bot/v1/events/handled', {
      headers: { 'x-api-key': API_KEY! },
      data: { eventId, source: 'poller' },
    });
    expect(r1.status()).toBe(201);
    expect((await r1.json()).wasNew).toBe(true);

    const r2 = await request.post('/api/bot/v1/events/handled', {
      headers: { 'x-api-key': API_KEY! },
      data: { eventId, source: 'webhook' }, // source différente, no-op
    });
    expect(r2.status()).toBe(200);
    const b2 = await r2.json();
    expect(b2.wasNew).toBe(false);
    expect(b2.handledAt).toBeTruthy();

    // La source n'est PAS écrasée par le 2e claim (winner = 1er).
    const { data } = await supabaseTestClient!
      .from('discord_event_ack')
      .select('source')
      .eq('event_id', eventId)
      .single();
    expect(data!.source).toBe('poller');
  });

  test('eventId non-UUID → 400', async ({ request }) => {
    const res = await request.post('/api/bot/v1/events/handled', {
      headers: { 'x-api-key': API_KEY! },
      data: { eventId: 'not-a-uuid' },
    });
    expect(res.status()).toBe(400);
  });

  test('sans x-api-key → 401', async ({ request }) => {
    const res = await request.post('/api/bot/v1/events/handled', {
      data: { eventId: crypto.randomUUID() },
    });
    expect(res.status()).toBe(401);
  });

  test('source absente est acceptée (NULL en DB)', async ({ request }) => {
    const eventId = crypto.randomUUID();
    createdEventIds.push(eventId);

    const res = await request.post('/api/bot/v1/events/handled', {
      headers: { 'x-api-key': API_KEY! },
      data: { eventId },
    });
    expect(res.status()).toBe(201);

    const { data } = await supabaseTestClient!
      .from('discord_event_ack')
      .select('source')
      .eq('event_id', eventId)
      .single();
    expect(data!.source).toBeNull();
  });
});
