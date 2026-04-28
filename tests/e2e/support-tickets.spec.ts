/**
 * Tests E2E — Support tickets (public POST /api/support/ticket)
 *
 * Couvre :
 *  - validation (catégorie, sévérité, message, sujet)
 *  - création anonyme
 *  - création nominative (email requis)
 *  - rejet de tournamentId invalide
 *  - troncature (sujet 200, message 5000)
 *  - 405 sur méthodes autres que POST
 */
import { test, expect } from '@playwright/test';
import { supabaseTestClient } from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();

const createdTicketIds: string[] = [];

test.describe.serial('Support tickets — public API', () => {
  test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

  test.afterAll(async () => {
    if (!supabaseTestClient || createdTicketIds.length === 0) return;
    await supabaseTestClient
      .from('support_tickets')
      .delete()
      .in('id', createdTicketIds);
  });

  /* ---------- Method check ---------- */

  test('GET renvoie 405', async ({ request }) => {
    const res = await request.get('/api/support/ticket');
    expect(res.status()).toBe(405);
  });

  /* ---------- Validation ---------- */

  test('rejette une catégorie invalide', async ({ request }) => {
    const res = await request.post('/api/support/ticket', {
      data: {
        category: 'spam',
        severity: 'low',
        message: 'lorem ipsum dolor sit amet',
        isAnonymous: true,
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Catégorie invalide/);
  });

  test('rejette une sévérité invalide', async ({ request }) => {
    const res = await request.post('/api/support/ticket', {
      data: {
        category: 'other',
        severity: 'critical',
        message: 'lorem ipsum dolor sit amet',
        isAnonymous: true,
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Sévérité invalide/);
  });

  test('rejette un message trop court', async ({ request }) => {
    const res = await request.post('/api/support/ticket', {
      data: {
        category: 'other',
        severity: 'low',
        message: 'court',
        isAnonymous: true,
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Message requis/);
  });

  test('rejette un message > 5000 chars', async ({ request }) => {
    const res = await request.post('/api/support/ticket', {
      data: {
        category: 'other',
        severity: 'low',
        message: 'x'.repeat(5001),
        isAnonymous: true,
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Message trop long/);
  });

  test('rejette un sujet > 200 chars', async ({ request }) => {
    const res = await request.post('/api/support/ticket', {
      data: {
        category: 'other',
        severity: 'low',
        subject: 'x'.repeat(201),
        message: 'lorem ipsum dolor sit amet',
        isAnonymous: true,
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Sujet trop long/);
  });

  test('rejette un tournamentId non-UUID', async ({ request }) => {
    const res = await request.post('/api/support/ticket', {
      data: {
        category: 'other',
        severity: 'low',
        message: 'lorem ipsum dolor sit amet',
        tournamentId: 'not-a-uuid',
        isAnonymous: true,
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/tournamentId invalide/);
  });

  test('rejette une signalisation non-anonyme sans email', async ({
    request,
  }) => {
    const res = await request.post('/api/support/ticket', {
      data: {
        category: 'other',
        severity: 'low',
        message: 'lorem ipsum dolor sit amet',
        isAnonymous: false,
        name: 'Alice',
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Email requis/);
  });

  /* ---------- Création ---------- */

  test('crée un ticket anonyme et renvoie un référence raccourci', async ({
    request,
  }) => {
    const res = await request.post('/api/support/ticket', {
      data: {
        category: 'dispute',
        severity: 'medium',
        subject: `E2E anon ${TS}`,
        message: 'Un message suffisamment long pour passer la validation.',
        isAnonymous: true,
        name: 'Should be ignored',
        email: 'should@be.ignored',
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.ticketId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(body.referenceShort).toBe(body.ticketId.slice(0, 8));

    createdTicketIds.push(body.ticketId);

    // Sanity check via DB: anonyme = pas de nom/email persistés
    const { data: row } = await supabaseTestClient!
      .from('support_tickets')
      .select(
        'reporter_name, reporter_email, is_anonymous, category, severity, status'
      )
      .eq('id', body.ticketId)
      .maybeSingle();

    expect(row).toBeTruthy();
    expect(row!.is_anonymous).toBe(true);
    expect(row!.reporter_name).toBeNull();
    expect(row!.reporter_email).toBeNull();
    expect(row!.category).toBe('dispute');
    expect(row!.severity).toBe('medium');
    expect(row!.status).toBe('open');
  });

  test('crée un ticket nominatif avec email lowercased', async ({
    request,
  }) => {
    const res = await request.post('/api/support/ticket', {
      data: {
        category: 'behavior',
        severity: 'high',
        subject: `E2E named ${TS}`,
        message: 'Description détaillée du problème, plus de 10 caractères.',
        isAnonymous: false,
        name: 'Alice Test',
        email: `E2E-Reporter-${TS}@TEST.LOCAL`,
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    createdTicketIds.push(body.ticketId);

    const { data: row } = await supabaseTestClient!
      .from('support_tickets')
      .select('reporter_name, reporter_email, is_anonymous, severity')
      .eq('id', body.ticketId)
      .maybeSingle();

    expect(row!.is_anonymous).toBe(false);
    expect(row!.reporter_name).toBe('Alice Test');
    expect(row!.reporter_email).toBe(`e2e-reporter-${TS}@test.local`);
    expect(row!.severity).toBe('high');
  });

  test('persiste le sujet trimmé', async ({ request }) => {
    const res = await request.post('/api/support/ticket', {
      data: {
        category: 'technical',
        severity: 'low',
        subject: `   Bug E2E ${TS}   `,
        message: 'Reproduction steps inside this body, more than 10 chars.',
        isAnonymous: true,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    createdTicketIds.push(body.ticketId);

    const { data: row } = await supabaseTestClient!
      .from('support_tickets')
      .select('subject, message')
      .eq('id', body.ticketId)
      .maybeSingle();

    expect(row!.subject).toBe(`Bug E2E ${TS}`);
    expect(row!.message.endsWith('chars.')).toBe(true);
  });
});
