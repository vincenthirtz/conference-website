// features/admin/adherents/service.ts — adhérents de l'association.

import type { ServiceContext } from '../../../utils/admin/serviceContext';
import {
  AdminError,
  LegacyAdminError,
  ValidationError,
} from '../../../utils/admin/errors';
import { fetchForms, fetchMemberships } from '../../../utils/helloasso';
import type { Audited } from '../_shared/audited';
import * as repo from './repository';
import type {
  AdherentCreateBody,
  AdherentListQuery,
  AdherentStats,
} from './schemas';

export async function listAdherentsWithStats(
  ctx: ServiceContext,
  query: AdherentListQuery
) {
  const currentYear = new Date().getFullYear();
  const [list, total, ofYear, paid, pending, overdue] = await Promise.all([
    repo.listAdherents(ctx.db, query),
    repo.countActiveAdherents(ctx.db),
    repo.countActiveAdherents(ctx.db, { currentYear }),
    repo.countActiveAdherents(ctx.db, { paymentStatus: 'paid' }),
    repo.countActiveAdherents(ctx.db, { paymentStatus: 'pending' }),
    repo.countActiveAdherents(ctx.db, { paymentStatus: 'overdue' }),
  ]);
  if (list.error) {
    ctx.logger.error('[admin/adherents] list error', list.error);
    throw new AdminError(
      500,
      'internal',
      'Chargement des adhérents impossible.'
    );
  }
  const stats: AdherentStats = {
    total,
    currentYear: ofYear,
    paid,
    pending,
    overdue,
  };
  return { items: list.rows, total: list.total, stats };
}

export async function createAdherent(
  ctx: ServiceContext,
  body: AdherentCreateBody,
  createdBy: string | null
) {
  if (await repo.findAdherentByEmail(ctx.db, body.email)) {
    throw new ValidationError('Un adhérent avec cet email existe déjà.', {
      email: 'Un adhérent avec cet email existe déjà.',
    });
  }
  const today = new Date().toISOString().split('T')[0];
  const { row, error } = await repo.insertAdherent(ctx.db, {
    first_name: body.firstName,
    last_name: body.lastName,
    email: body.email,
    phone: body.phone,
    birth_date: body.birthDate ?? null,
    address: body.address,
    city: body.city,
    postal_code: body.postalCode,
    country: body.country ?? 'France',
    join_date: body.joinDate ?? today,
    current_year: body.currentYear ?? new Date().getFullYear(),
    payment_status: body.paymentStatus ?? 'pending',
    payment_amount: body.paymentAmount ?? 0,
    payment_date: body.paymentDate ?? null,
    payment_method: body.paymentMethod ?? null,
    payment_reference: body.paymentReference,
    is_active: body.isActive ?? true,
    role: body.role ?? 'member',
    notes: body.notes,
    created_by: createdBy,
  });
  if (error || !row) {
    ctx.logger.error('[admin/adherents] create error', error);
    throw new AdminError(500, 'internal', 'Création de l’adhérent impossible.');
  }
  return row;
}

/* ------------------------------ Fiche adhérent ----------------------------- */

type AdherentPayload = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  joinDate?: string;
  currentYear?: number;
  paymentStatus?: 'pending' | 'partial' | 'paid' | 'exempt' | 'overdue';
  paymentAmount?: number;
  paymentDate?: string;
  paymentMethod?:
    | 'cash'
    | 'check'
    | 'transfer'
    | 'card'
    | 'helloasso'
    | 'other'
    | null;
  paymentReference?: string;
  isActive?: boolean;
  role?:
    | 'member'
    | 'volunteer'
    | 'board'
    | 'president'
    | 'treasurer'
    | 'secretary';
  notes?: string;
};

const MEMBER_NOT_FOUND = 'Member not found.';

export async function getAdherent(ctx: ServiceContext, id: string) {
  const { row, error } = await repo.findAdherent(ctx.db, id);
  if (error || !row) throw new LegacyAdminError(404, MEMBER_NOT_FOUND);
  // Historique des paiements, du plus récent au plus ancien.
  const payments = await repo.listAdherentPayments(ctx.db, id);
  return { ...row, payments };
}

/**
 * PATCH : mêmes règles que la route historique — champs appliqués tels
 * quels (chaînes vides → `null`), email unique, 400 si rien ne change.
 */
export async function patchAdherent(
  ctx: ServiceContext,
  id: string,
  raw: Record<string, unknown>,
  updatedBy: string | null
): Promise<
  Audited<NonNullable<Awaited<ReturnType<typeof repo.findAdherent>>['row']>>
> {
  const body = raw as AdherentPayload;
  const updates: Record<string, unknown> = {};

  if (body.firstName !== undefined) updates.first_name = body.firstName.trim();
  if (body.lastName !== undefined) updates.last_name = body.lastName.trim();
  if (body.email !== undefined) {
    const newEmail = body.email.toLowerCase().trim();
    // Vérifier que l'email n'existe pas déjà pour un autre adhérent
    if (await repo.emailTakenByOther(ctx.db, newEmail, id)) {
      throw new LegacyAdminError(
        400,
        'Another member already uses this email.'
      );
    }
    updates.email = newEmail;
  }
  if (body.phone !== undefined) updates.phone = body.phone?.trim() || null;
  if (body.birthDate !== undefined) updates.birth_date = body.birthDate || null;
  if (body.address !== undefined)
    updates.address = body.address?.trim() || null;
  if (body.city !== undefined) updates.city = body.city?.trim() || null;
  if (body.postalCode !== undefined)
    updates.postal_code = body.postalCode?.trim() || null;
  if (body.country !== undefined)
    updates.country = body.country?.trim() || 'France';
  if (body.joinDate !== undefined) updates.join_date = body.joinDate;
  if (body.currentYear !== undefined) updates.current_year = body.currentYear;
  if (body.paymentStatus !== undefined)
    updates.payment_status = body.paymentStatus;
  if (body.paymentAmount !== undefined)
    updates.payment_amount = body.paymentAmount;
  if (body.paymentDate !== undefined)
    updates.payment_date = body.paymentDate || null;
  if (body.paymentMethod !== undefined)
    updates.payment_method = body.paymentMethod || null;
  if (body.paymentReference !== undefined)
    updates.payment_reference = body.paymentReference?.trim() || null;
  if (body.isActive !== undefined) updates.is_active = body.isActive;
  if (body.role !== undefined) updates.role = body.role;
  if (body.notes !== undefined) updates.notes = body.notes?.trim() || null;

  updates.updated_by = updatedBy;

  if (Object.keys(updates).length === 1) {
    throw new LegacyAdminError(400, 'No changes provided.');
  }

  const { row, error } = await repo.updateAdherent(
    ctx.db,
    id,
    updates as Parameters<typeof repo.updateAdherent>[2]
  );
  if (error) {
    ctx.logger.error('[admin/adherents] update error', error);
    throw new LegacyAdminError(500, 'Failed to update the member.');
  }
  if (!row) throw new LegacyAdminError(404, MEMBER_NOT_FOUND);

  return {
    result: row,
    audit: {
      entity_type: 'adherent',
      entity_id: id,
      payload: {
        name: `${row.first_name} ${row.last_name}`,
        updates: Object.keys(updates).filter((k) => k !== 'updated_by'),
        action: 'update',
      },
    },
  };
}

export async function removeAdherent(
  ctx: ServiceContext,
  id: string
): Promise<Audited<{ success: true }>> {
  const existing = await repo.findAdherentIdentity(ctx.db, id);
  if (!existing) throw new LegacyAdminError(404, MEMBER_NOT_FOUND);

  const { error } = await repo.deleteAdherent(ctx.db, id);
  if (error) {
    ctx.logger.error('[admin/adherents] delete error', error);
    throw new LegacyAdminError(500, 'Failed to delete the member.');
  }
  return {
    result: { success: true },
    audit: {
      entity_type: 'adherent',
      entity_id: id,
      payload: {
        name: `${existing.first_name} ${existing.last_name}`,
        email: existing.email,
        action: 'delete',
      },
    },
  };
}

/* ------------------------------ HelloAsso ---------------------------------- */

const NO_MEMBERSHIP_FORM = "Aucun formulaire d'adhésion trouvé sur HelloAsso.";

function queryString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** GET /helloasso/memberships : une page d'adhésions, formulaire auto-détecté. */
export async function listHelloAssoMemberships(
  ctx: ServiceContext,
  query: Record<string, unknown>
) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 100));
  let formSlug = queryString(query.formSlug);

  try {
    if (!formSlug) {
      const forms = await fetchForms();
      const membershipForm = forms.find((f) => f.formType === 'Membership');
      if (!membershipForm) {
        throw new LegacyAdminError(404, NO_MEMBERSHIP_FORM, {
          extra: {
            forms: forms.map((f) => ({
              slug: f.formSlug,
              type: f.formType,
              title: f.title,
            })),
          },
        });
      }
      formSlug = membershipForm.formSlug;
    }

    const result = await fetchMemberships(formSlug, page, pageSize);
    return { formSlug, items: result.data, pagination: result.pagination };
  } catch (err) {
    if (err instanceof AdminError) throw err;
    ctx.logger.error('[admin/helloasso/memberships]', err);
    throw new LegacyAdminError(
      502,
      'Impossible de récupérer les adhésions depuis HelloAsso.'
    );
  }
}

type SyncedMembership = {
  email: string;
  firstName: string;
  lastName: string;
  amount: number;
  date: string;
  helloassoId: number;
};

/**
 * POST /helloasso/sync : importe les adhésions HelloAsso dans `adherents`
 * (création des emails inconnus, mise à jour du paiement des autres).
 */
export async function syncHelloAssoMemberships(
  ctx: ServiceContext,
  query: Record<string, unknown>,
  staffId: string | null
): Promise<
  Audited<{
    ok: true;
    total: number;
    created: number;
    updated: number;
    skipped: number;
  }>
> {
  let formSlug = queryString(query.formSlug);

  try {
    if (!formSlug) {
      const forms = await fetchForms();
      const membershipForm = forms.find((f) => f.formType === 'Membership');
      if (!membershipForm) throw new LegacyAdminError(404, NO_MEMBERSHIP_FORM);
      formSlug = membershipForm.formSlug;
    }

    // Toutes les pages d'adhésions.
    let page = 1;
    let totalPages = 1;
    const allMemberships: SyncedMembership[] = [];

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

    const emails = [...new Set(allMemberships.map((m) => m.email))];
    const existing = await repo.findAdherentsByEmails(ctx.db, emails);
    const existingMap = new Map(
      existing.map((a) => [
        a.email,
        a as { id: string; email: string; payment_reference: string | null },
      ])
    );

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const currentYear = new Date().getFullYear();

    for (const m of allMemberships) {
      const haRef = `helloasso:${m.helloassoId}`;
      const match = existingMap.get(m.email);

      if (match) {
        // Déjà synchronisé avec la même référence.
        if (match.payment_reference === haRef) {
          skipped++;
          continue;
        }
        const { error } = await repo.updateAdherentPayment(ctx.db, match.id, {
          payment_status: 'paid',
          payment_method: 'helloasso',
          payment_amount: m.amount,
          payment_date: m.date,
          payment_reference: haRef,
          current_year: currentYear,
          is_active: true,
          updated_by: staffId,
        });
        if (!error) updated++;
      } else {
        const { error } = await repo.insertAdherentRow(ctx.db, {
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
          created_by: staffId,
        });
        if (!error) {
          created++;
          // Un doublon dans le même lot est ignoré.
          existingMap.set(m.email, {
            id: '',
            email: m.email,
            payment_reference: haRef,
          });
        }
      }
    }

    return {
      result: {
        ok: true,
        total: allMemberships.length,
        created,
        updated,
        skipped,
      },
      audit: {
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
      },
    };
  } catch (err) {
    if (err instanceof AdminError) throw err;
    ctx.logger.error('[admin/helloasso/sync]', err);
    throw new LegacyAdminError(
      502,
      'Erreur lors de la synchronisation avec HelloAsso.'
    );
  }
}
