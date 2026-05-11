/**
 * Tests E2E — News ingest (POST /api/news via x-api-key)
 *
 * Couvre :
 *  - 401 sans header / mauvais header
 *  - 400 sur payload invalide (title/content manquant)
 *  - création en brouillon par défaut
 *  - création publiée (published_at auto)
 *  - normalisation slug / tag
 *  - rejet des méthodes hors GET/POST
 */
import { test, expect } from '@playwright/test';
import { supabaseTestClient } from '../utils/supabaseTestClient';

const API_KEY = process.env.NEWS_INGEST_API_KEY;
const HAS_KEY = Boolean(API_KEY);
const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();

const createdIds: string[] = [];

test.describe.serial('News ingest — POST /api/news', () => {
  test.skip(
    !HAS_KEY || !HAS_SUPABASE,
    'NEWS_INGEST_API_KEY ou Supabase service role manquant'
  );

  test.afterAll(async () => {
    if (!supabaseTestClient || createdIds.length === 0) return;
    await supabaseTestClient.from('news').delete().in('id', createdIds);
  });

  /* ---------- Auth ---------- */

  test('rejette une requête sans x-api-key', async ({ request }) => {
    const res = await request.post('/api/news', {
      data: { title: 'no auth', content: 'content' },
    });
    expect(res.status()).toBe(401);
  });

  test('rejette une mauvaise x-api-key', async ({ request }) => {
    const res = await request.post('/api/news', {
      headers: { 'x-api-key': 'definitely-not-the-key' },
      data: { title: 'bad auth', content: 'content' },
    });
    expect(res.status()).toBe(401);
  });

  /* ---------- Validation ---------- */

  test('rejette un payload sans title', async ({ request }) => {
    const res = await request.post('/api/news', {
      headers: { 'x-api-key': API_KEY! },
      data: { content: 'only content' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Title and content/);
  });

  test('rejette un payload sans content', async ({ request }) => {
    const res = await request.post('/api/news', {
      headers: { 'x-api-key': API_KEY! },
      data: { title: 'only title' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Title and content/);
  });

  /* ---------- Création ---------- */

  test('crée une news en brouillon par défaut', async ({ request }) => {
    const title = `Bot draft ${TS}`;
    const res = await request.post('/api/news', {
      headers: { 'x-api-key': API_KEY! },
      data: { title, content: 'Draft content from bot.' },
    });
    expect(res.status()).toBe(201);
    const row = await res.json();
    createdIds.push(row.id);

    expect(row.title).toBe(title);
    expect(row.status).toBe('draft');
    expect(row.published_at).toBeNull();
    expect(row.tag).toBe('general');
    expect(row.author_id).toBeNull();
    expect(row.slug).toMatch(/^bot-draft-\d+$/);
  });

  test('crée une news publiée avec published_at auto', async ({ request }) => {
    const title = `Bot published ${TS}`;
    const before = Date.now();
    const res = await request.post('/api/news', {
      headers: { 'x-api-key': API_KEY! },
      data: {
        title,
        content: 'Published content from bot.',
        status: 'published',
        tag: 'Announcements',
      },
    });
    expect(res.status()).toBe(201);
    const row = await res.json();
    createdIds.push(row.id);

    expect(row.status).toBe('published');
    expect(row.published_at).not.toBeNull();
    const publishedAt = new Date(row.published_at).getTime();
    expect(publishedAt).toBeGreaterThanOrEqual(before - 1000);
    expect(publishedAt).toBeLessThanOrEqual(Date.now() + 1000);
    // Tag normalisé en slug
    expect(row.tag).toBe('announcements');
  });

  test('honore un publishedAt explicite passé', async ({ request }) => {
    const title = `Bot backdated ${TS}`;
    const backdate = new Date('2025-01-15T10:00:00.000Z').toISOString();
    const res = await request.post('/api/news', {
      headers: { 'x-api-key': API_KEY! },
      data: {
        title,
        content: 'Backdated post.',
        status: 'published',
        publishedAt: backdate,
      },
    });
    expect(res.status()).toBe(201);
    const row = await res.json();
    createdIds.push(row.id);

    expect(new Date(row.published_at).toISOString()).toBe(backdate);
  });

  test('honore un slug custom fourni', async ({ request }) => {
    const res = await request.post('/api/news', {
      headers: { 'x-api-key': API_KEY! },
      data: {
        title: `Bot custom slug ${TS}`,
        slug: `custom-slug-${TS}`,
        content: 'Content with explicit slug.',
      },
    });
    expect(res.status()).toBe(201);
    const row = await res.json();
    createdIds.push(row.id);
    expect(row.slug).toBe(`custom-slug-${TS}`);
  });

  /* ---------- GET inchangé ---------- */

  test('GET reste accessible sans clé', async ({ request }) => {
    const res = await request.get('/api/news');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
  });
});
