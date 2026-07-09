import { test, expect } from '@playwright/test';
import { supabaseTestClient } from '../utils/supabaseTestClient';

test.describe('Admin adherents pages (sans auth)', () => {
  test('GET /admin/association?tab=adherents redirige vers login', async ({
    page,
  }) => {
    await page.goto('/admin/association?tab=adherents');
    await page.waitForTimeout(1000);

    const url = page.url();
    const redirectedToLogin = url.includes('/login');
    const redirectedTo403 = url.includes('/403');

    expect(
      redirectedToLogin || redirectedTo403,
      `/admin/association?tab=adherents devrait rediriger vers login ou 403. URL actuelle: ${url}`
    ).toBeTruthy();
  });

  test('GET /admin/adherents/new redirige vers login', async ({ page }) => {
    await page.goto('/admin/adherents/new');
    await page.waitForTimeout(1000);

    const url = page.url();
    const redirectedToLogin = url.includes('/login');
    const redirectedTo403 = url.includes('/403');

    expect(
      redirectedToLogin || redirectedTo403,
      `/admin/adherents/new devrait rediriger vers login ou 403. URL actuelle: ${url}`
    ).toBeTruthy();
  });

  test('GET /admin/adherents/[id] redirige vers login', async ({ page }) => {
    await page.goto('/admin/adherents/00000000-0000-0000-0000-000000000000');
    await page.waitForTimeout(1000);

    const url = page.url();
    const redirectedToLogin = url.includes('/login');
    const redirectedTo403 = url.includes('/403');

    expect(
      redirectedToLogin || redirectedTo403,
      `/admin/adherents/[id] devrait rediriger vers login ou 403. URL actuelle: ${url}`
    ).toBeTruthy();
  });
});

test.describe('API adherents protection', () => {
  test('GET /api/admin/adherents sans auth retourne 401 ou 403', async ({
    request,
  }) => {
    const res = await request.get('/api/admin/adherents');
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/admin/adherents sans auth retourne 401 ou 403', async ({
    request,
  }) => {
    const res = await request.post('/api/admin/adherents', {
      data: {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
      },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/admin/adherents/[id] sans auth retourne 401 ou 403', async ({
    request,
  }) => {
    const res = await request.get(
      '/api/admin/adherents/00000000-0000-0000-0000-000000000000'
    );
    expect([401, 403]).toContain(res.status());
  });

  test('PATCH /api/admin/adherents/[id] sans auth retourne 401 ou 403', async ({
    request,
  }) => {
    const res = await request.patch(
      '/api/admin/adherents/00000000-0000-0000-0000-000000000000',
      {
        data: { firstName: 'Updated' },
      }
    );
    expect([401, 403]).toContain(res.status());
  });

  test('DELETE /api/admin/adherents/[id] sans auth retourne 401 ou 403', async ({
    request,
  }) => {
    const res = await request.delete(
      '/api/admin/adherents/00000000-0000-0000-0000-000000000000'
    );
    expect([401, 403]).toContain(res.status());
  });
});

test.describe('Adherents CRUD (supabase)', () => {
  test.skip(
    !supabaseTestClient,
    'Supabase service role manquant pour les adherents'
  );

  test('Créer, modifier, supprimer un adhérent', async () => {
    if (!supabaseTestClient) return;

    const timestamp = Date.now();
    const email = `e2e-adherent-${timestamp}@test.com`;

    // Create
    const { data: created, error: createErr } = await supabaseTestClient
      .from('adherents')
      .insert({
        first_name: 'Test',
        last_name: 'Adherent',
        email,
        payment_status: 'pending',
        current_year: new Date().getFullYear(),
        is_active: true,
      })
      .select('id, first_name, last_name, email, member_number')
      .maybeSingle();

    expect(createErr).toBeNull();
    expect(created?.id).toBeTruthy();
    expect(created?.email).toBe(email);
    // Le member_number devrait être auto-généré par le trigger
    expect(created?.member_number).toBeTruthy();

    const adherentId = created!.id;

    // Update
    const newFirstName = 'Updated';
    const newPaymentStatus = 'paid';
    const { data: updated, error: updateErr } = await supabaseTestClient
      .from('adherents')
      .update({
        first_name: newFirstName,
        payment_status: newPaymentStatus,
        payment_date: new Date().toISOString(),
      })
      .eq('id', adherentId)
      .select('id, first_name, payment_status')
      .maybeSingle();

    expect(updateErr).toBeNull();
    expect(updated?.first_name).toBe(newFirstName);
    expect(updated?.payment_status).toBe(newPaymentStatus);

    // Delete
    const { error: delErr } = await supabaseTestClient
      .from('adherents')
      .delete()
      .eq('id', adherentId);
    expect(delErr).toBeNull();

    // Verify deletion
    const { data: check, error: checkErr } = await supabaseTestClient
      .from('adherents')
      .select('id')
      .eq('id', adherentId)
      .maybeSingle();
    expect(checkErr).toBeNull();
    expect(check).toBeNull();
  });

  test('Le member_number est unique et auto-généré', async () => {
    if (!supabaseTestClient) return;

    const timestamp = Date.now();

    // Create first adherent
    const { data: first, error: firstErr } = await supabaseTestClient
      .from('adherents')
      .insert({
        first_name: 'First',
        last_name: 'Member',
        email: `e2e-first-${timestamp}@test.com`,
        payment_status: 'pending',
        current_year: new Date().getFullYear(),
        is_active: true,
      })
      .select('id, member_number')
      .maybeSingle();

    expect(firstErr).toBeNull();
    expect(first?.member_number).toBeTruthy();

    // Create second adherent
    const { data: second, error: secondErr } = await supabaseTestClient
      .from('adherents')
      .insert({
        first_name: 'Second',
        last_name: 'Member',
        email: `e2e-second-${timestamp}@test.com`,
        payment_status: 'pending',
        current_year: new Date().getFullYear(),
        is_active: true,
      })
      .select('id, member_number')
      .maybeSingle();

    expect(secondErr).toBeNull();
    expect(second?.member_number).toBeTruthy();

    // Member numbers should be different
    expect(first?.member_number).not.toBe(second?.member_number);

    // Cleanup
    if (first?.id) {
      await supabaseTestClient.from('adherents').delete().eq('id', first.id);
    }
    if (second?.id) {
      await supabaseTestClient.from('adherents').delete().eq('id', second.id);
    }
  });

  test('Email unique constraint fonctionne', async () => {
    if (!supabaseTestClient) return;

    const timestamp = Date.now();
    const email = `e2e-duplicate-${timestamp}@test.com`;

    // Create first adherent
    const { data: first, error: firstErr } = await supabaseTestClient
      .from('adherents')
      .insert({
        first_name: 'First',
        last_name: 'Duplicate',
        email,
        payment_status: 'pending',
        current_year: new Date().getFullYear(),
        is_active: true,
      })
      .select('id')
      .maybeSingle();

    expect(firstErr).toBeNull();
    expect(first?.id).toBeTruthy();

    // Try to create second adherent with same email
    const { error: duplicateErr } = await supabaseTestClient
      .from('adherents')
      .insert({
        first_name: 'Second',
        last_name: 'Duplicate',
        email, // Same email
        payment_status: 'pending',
        current_year: new Date().getFullYear(),
        is_active: true,
      })
      .select('id')
      .maybeSingle();

    // Should fail with unique constraint violation
    expect(duplicateErr).not.toBeNull();
    expect(duplicateErr?.code).toBe('23505'); // PostgreSQL unique violation

    // Cleanup
    if (first?.id) {
      await supabaseTestClient.from('adherents').delete().eq('id', first.id);
    }
  });

  test('Les statuts de paiement sont valides', async () => {
    if (!supabaseTestClient) return;

    const timestamp = Date.now();
    const validStatuses = ['pending', 'paid', 'overdue', 'waived', 'refunded'];

    for (const status of validStatuses) {
      const { data, error } = await supabaseTestClient
        .from('adherents')
        .insert({
          first_name: 'Status',
          last_name: 'Test',
          email: `e2e-status-${status}-${timestamp}@test.com`,
          payment_status: status,
          current_year: new Date().getFullYear(),
          is_active: true,
        })
        .select('id, payment_status')
        .maybeSingle();

      expect(error).toBeNull();
      expect(data?.payment_status).toBe(status);

      // Cleanup
      if (data?.id) {
        await supabaseTestClient.from('adherents').delete().eq('id', data.id);
      }
    }
  });

  test('Adhérent inactif peut être filtré', async () => {
    if (!supabaseTestClient) return;

    const timestamp = Date.now();

    // Create active adherent
    const { data: active } = await supabaseTestClient
      .from('adherents')
      .insert({
        first_name: 'Active',
        last_name: 'Member',
        email: `e2e-active-${timestamp}@test.com`,
        payment_status: 'paid',
        current_year: new Date().getFullYear(),
        is_active: true,
      })
      .select('id')
      .maybeSingle();

    // Create inactive adherent
    const { data: inactive } = await supabaseTestClient
      .from('adherents')
      .insert({
        first_name: 'Inactive',
        last_name: 'Member',
        email: `e2e-inactive-${timestamp}@test.com`,
        payment_status: 'paid',
        current_year: new Date().getFullYear(),
        is_active: false,
      })
      .select('id')
      .maybeSingle();

    // Query only active members
    const { data: activeOnly } = await supabaseTestClient
      .from('adherents')
      .select('id')
      .eq('is_active', true)
      .in('id', [active?.id, inactive?.id].filter(Boolean));

    expect(activeOnly?.length).toBe(1);
    expect(activeOnly?.[0]?.id).toBe(active?.id);

    // Cleanup
    if (active?.id) {
      await supabaseTestClient.from('adherents').delete().eq('id', active.id);
    }
    if (inactive?.id) {
      await supabaseTestClient.from('adherents').delete().eq('id', inactive.id);
    }
  });
});

test.describe('Adherent payment history (supabase)', () => {
  test.skip(
    !supabaseTestClient,
    'Supabase service role manquant pour adherent_payments'
  );

  test('Créer un historique de paiement pour un adhérent', async () => {
    if (!supabaseTestClient) return;

    const timestamp = Date.now();
    const currentYear = new Date().getFullYear();

    // Create adherent first
    const { data: adherent, error: adherentErr } = await supabaseTestClient
      .from('adherents')
      .insert({
        first_name: 'Payment',
        last_name: 'Test',
        email: `e2e-payment-${timestamp}@test.com`,
        payment_status: 'pending',
        current_year: currentYear,
        is_active: true,
      })
      .select('id')
      .maybeSingle();

    expect(adherentErr).toBeNull();
    expect(adherent?.id).toBeTruthy();

    // Create payment record
    const { data: payment, error: paymentErr } = await supabaseTestClient
      .from('adherent_payments')
      .insert({
        adherent_id: adherent!.id,
        year: currentYear,
        amount: 25.0,
        payment_method: 'card',
        status: 'paid',
        paid_at: new Date().toISOString(),
      })
      .select('id, year, amount, status')
      .maybeSingle();

    expect(paymentErr).toBeNull();
    expect(payment?.id).toBeTruthy();
    expect(payment?.year).toBe(currentYear);
    expect(payment?.status).toBe('paid');

    // Cleanup - delete payment first (foreign key)
    if (payment?.id) {
      await supabaseTestClient
        .from('adherent_payments')
        .delete()
        .eq('id', payment.id);
    }
    if (adherent?.id) {
      await supabaseTestClient.from('adherents').delete().eq('id', adherent.id);
    }
  });

  test('Un adhérent peut avoir plusieurs paiements (années différentes)', async () => {
    if (!supabaseTestClient) return;

    const timestamp = Date.now();
    const currentYear = new Date().getFullYear();

    // Create adherent
    const { data: adherent } = await supabaseTestClient
      .from('adherents')
      .insert({
        first_name: 'Multi',
        last_name: 'Payment',
        email: `e2e-multi-payment-${timestamp}@test.com`,
        payment_status: 'paid',
        current_year: currentYear,
        is_active: true,
      })
      .select('id')
      .maybeSingle();

    expect(adherent?.id).toBeTruthy();

    // Create payments for multiple years
    const years = [currentYear - 1, currentYear];
    const paymentIds: string[] = [];

    for (const year of years) {
      const { data: payment } = await supabaseTestClient
        .from('adherent_payments')
        .insert({
          adherent_id: adherent!.id,
          year,
          amount: 25.0,
          payment_method: 'card',
          status: 'paid',
          paid_at: new Date().toISOString(),
        })
        .select('id')
        .maybeSingle();

      if (payment?.id) paymentIds.push(payment.id);
    }

    expect(paymentIds.length).toBe(2);

    // Verify both payments exist
    const { data: allPayments } = await supabaseTestClient
      .from('adherent_payments')
      .select('id, year')
      .eq('adherent_id', adherent!.id)
      .order('year', { ascending: true });

    expect(allPayments?.length).toBe(2);
    expect(allPayments?.[0]?.year).toBe(currentYear - 1);
    expect(allPayments?.[1]?.year).toBe(currentYear);

    // Cleanup
    for (const id of paymentIds) {
      await supabaseTestClient.from('adherent_payments').delete().eq('id', id);
    }
    if (adherent?.id) {
      await supabaseTestClient.from('adherents').delete().eq('id', adherent.id);
    }
  });
});
