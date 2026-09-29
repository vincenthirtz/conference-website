// features/admin/adherents/service.ts — adhérents de l'association.

import type { ServiceContext } from '../../../utils/admin/serviceContext';
import { AdminError, ValidationError } from '../../../utils/admin/errors';
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
