import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, StaffContext } from '@/utils/staff';
import { fetchMemberships, fetchForms } from '@/utils/helloasso';
import { logStaffAction } from '@/utils/staffLogs';
import { applyRateLimit } from '@/utils/rateLimit';

import { logger } from '../../../../utils/logger';
/**
 * POST /api/admin/helloasso/sync
 *
 * Syncs HelloAsso memberships into the local adherents table.
 * - Creates new adherents for unknown emails
 * - Updates payment status for existing adherents
 *
 * Query params:
 *   - formSlug: slug of the Membership form (optional — auto-detects)
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: StaffContext
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(
      req,
      res,
      { max: 5, windowMs: 60_000 },
      'admin-helloasso-sync'
    )
  )
    return;

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable.' });
  }
  const admin = supabaseAdmin;

  let formSlug =
    typeof req.query.formSlug === 'string' ? req.query.formSlug : '';

  try {
    // Auto-detect membership form
    if (!formSlug) {
      const forms = await fetchForms();
      const membershipForm = forms.find((f) => f.formType === 'Membership');
      if (!membershipForm) {
        return res.status(404).json({
          error: "Aucun formulaire d'adhésion trouvé sur HelloAsso.",
        });
      }
      formSlug = membershipForm.formSlug;
    }

    // Fetch all pages of memberships
    let page = 1;
    let totalPages = 1;
    const allMemberships: Array<{
      email: string;
      firstName: string;
      lastName: string;
      amount: number;
      date: string;
      helloassoId: number;
    }> = [];

    while (page <= totalPages) {
      const result = await fetchMemberships(formSlug, page, 100);
      totalPages = result.pagination.totalPages;

      for (const item of result.data) {
        const email = item.payer?.email?.toLowerCase().trim();
        if (!email) continue;

        allMemberships.push({
          email,
          firstName: item.user?.firstName || item.payer?.firstName || '',
          lastName: item.user?.lastName || item.payer?.lastName || '',
          amount: item.amount / 100,
          date:
            item.order?.date?.split('T')[0] ||
            new Date().toISOString().split('T')[0],
          helloassoId: item.id,
        });
      }

      page++;
    }

    // Fetch existing adherents by email
    const emails = [...new Set(allMemberships.map((m) => m.email))];
    const { data: existing } = await admin
      .from('adherents')
      .select('id, email, payment_reference')
      .in('email', emails);

    const existingMap = new Map((existing ?? []).map((a) => [a.email, a]));

    let created = 0;
    let updated = 0;
    let skipped = 0;

    const currentYear = new Date().getFullYear();

    for (const m of allMemberships) {
      const haRef = `helloasso:${m.helloassoId}`;
      const match = existingMap.get(m.email);

      if (match) {
        // Skip if already synced with same reference
        if (match.payment_reference === haRef) {
          skipped++;
          continue;
        }

        // Update payment info
        const { error } = await admin
          .from('adherents')
          .update({
            payment_status: 'paid' as const,
            payment_method: 'helloasso' as const,
            payment_amount: m.amount,
            payment_date: m.date,
            payment_reference: haRef,
            current_year: currentYear,
            is_active: true,
            updated_by: ctx.staff?.id || null,
          })
          .eq('id', match.id);

        if (!error) updated++;
      } else {
        // Create new adherent
        const { error } = await admin.from('adherents').insert({
          first_name: m.firstName,
          last_name: m.lastName,
          email: m.email,
          join_date: m.date,
          current_year: currentYear,
          payment_status: 'paid',
          payment_method: 'helloasso',
          payment_amount: m.amount,
          payment_date: m.date,
          payment_reference: haRef,
          is_active: true,
          role: 'member',
          country: 'France',
          created_by: ctx.staff?.id || null,
        });

        if (!error) {
          created++;
          // Add to map so duplicates within the batch are skipped
          existingMap.set(m.email, {
            id: '',
            email: m.email,
            payment_reference: haRef,
          });
        }
      }
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'adherent',
        entity_id: null,
        payload: {
          action: 'helloasso_sync',
          formSlug,
          total: allMemberships.length,
          created,
          updated,
          skipped,
        },
      });
    }

    return res.status(200).json({
      ok: true,
      total: allMemberships.length,
      created,
      updated,
      skipped,
    });
  } catch (err) {
    logger.error('[admin/helloasso/sync]', err);
    return res.status(502).json({
      error: 'Erreur lors de la synchronisation avec HelloAsso.',
    });
  }
}

export default withStaffRoute(handler, 'admin');
