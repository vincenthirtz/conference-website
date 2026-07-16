// tests/e2e/admin-idempotency.spec.ts
// Valide le mécanisme Idempotency-Key côté routes admin :
//   - sans header : exécution normale
//   - avec header (même body) : 2e appel renvoie la réponse cache + header
//     `Idempotency-Replay: true`
//   - avec header (body différent) : pas de cache hit (bodyHash différent)
//
// On utilise POST /admin/scrims (la plus simple à exercer : pas de fixtures
// lourdes, juste un nom + slug auto). Le mécanisme est partagé via
// withAdminIdempotency, donc valider ici suffit pour garantir le pattern.

import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import {
  supabaseTestClient,
  createTestStaff,
  deleteTestStaff,
} from '../utils/supabaseTestClient';

const HAS_SUPABASE = Boolean(supabaseTestClient);
const TS = Date.now();
const STAFF_EMAIL = `hirtzvincent+e2e-idem-${TS}@gmail.com`;
const PASSWORD = 'TestPassw0rd!42';

const supabaseUrl =
  process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function getStaffToken(): Promise<string | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  const client = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await client.auth.signInWithPassword({
    email: STAFF_EMAIL,
    password: PASSWORD,
  });
  if (error || !data.session) return null;
  return data.session.access_token;
}

async function loginAsUI(page: Page, email: string) {
  await page.goto('/login');
  await page.fill('input#email', email);
  await page.fill('input#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10000 });
}

test.describe.serial('Admin idempotency middleware', () => {
  test.skip(!HAS_SUPABASE, 'Supabase service role manquant');

  let staffToken: string | null = null;
  const createdScrimIds: string[] = [];

  test.beforeAll(async () => {
    if (!supabaseTestClient) return;
    await deleteTestStaff(STAFF_EMAIL);
    await createTestStaff(STAFF_EMAIL, PASSWORD, 'admin');
    staffToken = await getStaffToken();
    expect(staffToken, 'staff token must be obtained').toBeTruthy();
  });

  test.afterAll(async () => {
    if (!supabaseTestClient) return;
    for (const id of createdScrimIds) {
      await supabaseTestClient.from('scrims').delete().eq('id', id);
    }
    // Cleanup keys créées pendant les tests pour ne pas polluer les autres runs.
    await supabaseTestClient
      .from('admin_idempotency')
      .delete()
      .like('cache_key', `% admin-scrims %`);
    await deleteTestStaff(STAFF_EMAIL);
  });

  test('sans Idempotency-Key : deux POST identiques créent deux scrims', async ({
    request,
  }) => {
    const name = `E2E Idem No Key ${TS}`;
    const r1 = await request.post('/api/admin/scrims', {
      headers: { Authorization: `Bearer ${staffToken}` },
      data: { name: `${name} #1` },
    });
    expect(r1.status()).toBe(201);
    const b1 = await r1.json();
    createdScrimIds.push(b1.scrim.id);

    const r2 = await request.post('/api/admin/scrims', {
      headers: { Authorization: `Bearer ${staffToken}` },
      data: { name: `${name} #2` },
    });
    expect(r2.status()).toBe(201);
    const b2 = await r2.json();
    createdScrimIds.push(b2.scrim.id);

    expect(b1.scrim.id).not.toBe(b2.scrim.id);
  });

  test('avec Idempotency-Key + même body : 2e appel renvoie la réponse cache', async ({
    request,
  }) => {
    const key = `e2e-idem-${TS}-same-body`;
    const body = { name: `E2E Idem SameBody ${TS}` };

    const r1 = await request.post('/api/admin/scrims', {
      headers: {
        Authorization: `Bearer ${staffToken}`,
        'Idempotency-Key': key,
      },
      data: body,
    });
    expect(r1.status()).toBe(201);
    expect(r1.headers()['idempotency-replay']).toBeUndefined();
    const b1 = await r1.json();
    createdScrimIds.push(b1.scrim.id);

    const r2 = await request.post('/api/admin/scrims', {
      headers: {
        Authorization: `Bearer ${staffToken}`,
        'Idempotency-Key': key,
      },
      data: body,
    });
    expect(r2.status()).toBe(201);
    expect(r2.headers()['idempotency-replay']).toBe('true');
    const b2 = await r2.json();
    // Replay = même body, donc même scrim id côté réponse — mais aucune
    // nouvelle insertion DB (le body de réponse est juste rejoué).
    expect(b2.scrim.id).toBe(b1.scrim.id);
  });

  test('UI · le hook useIdempotentMutation injecte le header sur POST scrim', async ({
    page,
  }) => {
    await loginAsUI(page, STAFF_EMAIL);
    // La création est désormais une modale in-place (deep-link ?new=1) ; la
    // liste des teams est chargée à l'ouverture de la modale.
    await page.goto('/admin/scrims?new=1');
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });

    // On attend que le formulaire soit interactif (le champ Nom est rendu de
    // toute façon, pas dépendant du fetch teams).
    const nameInput = page.locator('input[required]').first();
    await nameInput.waitFor({ state: 'visible', timeout: 10000 });
    await nameInput.fill(`E2E Idem UI ${TS}`);

    // Capture la requête POST avant le click pour vérifier le header.
    const reqPromise = page.waitForRequest(
      (req) =>
        req.url().endsWith('/api/admin/scrims') && req.method() === 'POST'
    );
    await page.locator('button[type="submit"]').click();
    const req = await reqPromise;

    const headers = req.headers();
    const key = headers['idempotency-key'];
    expect(key, 'Idempotency-Key header doit être présent').toBeTruthy();
    // UUID v4 : 8-4-4-4-12 hex chars + tirets. Tolère un format fallback aussi.
    expect(key!.length).toBeGreaterThanOrEqual(16);

    // Cleanup : le scrim créé via UI doit être supprimé pour ne pas
    // polluer les autres runs.
    if (supabaseTestClient) {
      await supabaseTestClient
        .from('scrims')
        .delete()
        .like('name', `E2E Idem UI %`);
    }
  });

  test('avec Idempotency-Key + body différent : pas de cache hit', async ({
    request,
  }) => {
    const key = `e2e-idem-${TS}-diff-body`;

    const r1 = await request.post('/api/admin/scrims', {
      headers: {
        Authorization: `Bearer ${staffToken}`,
        'Idempotency-Key': key,
      },
      data: { name: `E2E Idem DiffBody A ${TS}` },
    });
    expect(r1.status()).toBe(201);
    const b1 = await r1.json();
    createdScrimIds.push(b1.scrim.id);

    const r2 = await request.post('/api/admin/scrims', {
      headers: {
        Authorization: `Bearer ${staffToken}`,
        'Idempotency-Key': key,
      },
      data: { name: `E2E Idem DiffBody B ${TS}` },
    });
    expect(r2.status()).toBe(201);
    expect(r2.headers()['idempotency-replay']).toBeUndefined();
    const b2 = await r2.json();
    createdScrimIds.push(b2.scrim.id);

    // bodyHash différent → pas de cache hit → vraie nouvelle ressource.
    expect(b2.scrim.id).not.toBe(b1.scrim.id);
  });
});
