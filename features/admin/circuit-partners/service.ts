// features/admin/circuit-partners/service.ts — la file des candidatures à
// l'offre partenaire des circuits, et la décision du staff plateforme.
//
// L'accord passe par `grantCircuitPartnerOffer` (util partagé) : décision
// réservée atomiquement, jamais de rétrogradation, retour arrière si le plan
// ne peut pas être posé. L'accord est journalisé CHEZ l'espace bénéficiaire ;
// le refus chez le staff ; la mise en examen ne l'est pas.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { AdminError, LegacyAdminError } from '@/utils/admin/errors';
import { grantCircuitPartnerOffer } from '@/utils/billing/circuitPartnerGrant';
import type { Audited } from '../_shared/audited';
import * as repo from './repository';
import { CIRCUIT_APPLICATION_STATUSES, DecisionBody } from './schemas';

const READ_FAILED = 'Lecture impossible.';

export async function listCircuitApplications(
  ctx: ServiceContext,
  query: Record<string, unknown>
) {
  const status =
    typeof query.status === 'string' &&
    (CIRCUIT_APPLICATION_STATUSES as readonly string[]).includes(query.status)
      ? query.status
      : null;

  const { rows: items, error } = await repo.listApplications(ctx.db, status);
  if (error) {
    ctx.logger.error('[admin/circuit-partners] list error: %s', error.message);
    throw new AdminError(500, 'internal', READ_FAILED);
  }

  // Le slug de l'espace qui a reçu l'offre : celui qu'indiquait la candidature
  // peut différer de celui que le staff a finalement retenu.
  const grantedIds = [
    ...new Set(
      items
        .map((item) => item.granted_tenant_id)
        .filter((id): id is string => typeof id === 'string')
    ),
  ];
  const slugById = new Map<string, string>();
  if (grantedIds.length > 0) {
    const { rows: tenants, error: tenantError } = await repo.listTenantSlugs(
      ctx.db,
      grantedIds
    );
    if (tenantError) {
      ctx.logger.error(
        '[admin/circuit-partners] tenants error: %s',
        tenantError.message
      );
      throw new AdminError(500, 'internal', READ_FAILED);
    }
    for (const row of tenants) slugById.set(row.id, row.slug);
  }

  const { rows: all, error: countError } = await repo.listApplicationStatuses(
    ctx.db
  );
  if (countError) {
    ctx.logger.error(
      '[admin/circuit-partners] count error: %s',
      countError.message
    );
    throw new AdminError(500, 'internal', READ_FAILED);
  }
  const counts: Record<string, number> = Object.fromEntries(
    CIRCUIT_APPLICATION_STATUSES.map((s) => [s, 0])
  );
  for (const row of all) counts[row.status] = (counts[row.status] ?? 0) + 1;

  return {
    items: items.map((item) => ({
      ...item,
      granted_tenant_slug: item.granted_tenant_id
        ? (slugById.get(item.granted_tenant_id) ?? null)
        : null,
    })),
    counts,
  };
}

const GRANT_ERRORS: Record<string, { status: number; error: string }> = {
  not_found: { status: 404, error: 'Candidature introuvable.' },
  tenant_not_found: {
    status: 404,
    error: 'Aucun espace actif ne porte ce slug.',
  },
  already_decided: {
    status: 409,
    error: 'Cette candidature a déjà été tranchée.',
  },
  plan_already_covers: {
    status: 409,
    error:
      'Cet espace a déjà un plan qui couvre l’offre, ou une échéance plus lointaine.',
  },
  failed: { status: 500, error: 'Accord impossible pour le moment.' },
};

type DecisionResult =
  | {
      ok: true;
      status: 'approved';
      tenantSlug: string;
      plan: string;
      grantedUntil: string;
    }
  | { ok: true; status: 'reviewing' | 'rejected' };

export async function decideCircuitApplication(
  ctx: ServiceContext,
  id: string,
  rawBody: unknown
): Promise<Audited<DecisionResult>> {
  const parsed = DecisionBody.safeParse(rawBody ?? {});
  if (!parsed.success) {
    throw new LegacyAdminError(400, 'Décision invalide.', {
      code: 'VALIDATION',
    });
  }
  const body = parsed.data;
  if (ctx.actor.kind !== 'staff') {
    throw new AdminError(403, 'forbidden', 'Accès refusé.');
  }
  const staffId = ctx.actor.staffId;

  if (body.action === 'approve') {
    const result = await grantCircuitPartnerOffer({
      applicationId: id,
      tenantSlug: body.tenantSlug,
      staffId,
      notes: body.notes ?? null,
    });
    if (!result.ok) {
      const mapped = GRANT_ERRORS[result.reason] ?? GRANT_ERRORS.failed;
      throw new LegacyAdminError(mapped.status, mapped.error, {
        code: result.reason,
      });
    }
    return {
      result: {
        ok: true,
        status: 'approved',
        tenantSlug: result.tenantSlug,
        plan: result.plan,
        grantedUntil: result.grantedUntil,
      },
      audit: {
        action: 'approve_circuit_partner',
        // Journalisé chez l'espace qui reçoit le plan.
        tenant_id: result.tenantId,
        entity_type: 'tenant',
        entity_id: result.tenantId,
        payload: {
          applicationId: id,
          tenantSlug: result.tenantSlug,
          plan: result.plan,
          grantedUntil: result.grantedUntil,
        },
      },
    };
  }

  const nextStatus = body.action === 'review' ? 'reviewing' : 'rejected';
  const now = new Date().toISOString();
  const { rows, error } = await repo.setApplicationStatus(ctx.db, id, {
    status: nextStatus,
    ...(body.notes ? { admin_notes: body.notes } : {}),
    ...(nextStatus === 'rejected'
      ? { decided_by: staffId, decided_at: now }
      : {}),
  });
  if (error) {
    ctx.logger.error(
      '[admin/circuit-partners] update error: %s',
      error.message
    );
    throw new AdminError(500, 'internal', 'Mise à jour impossible.');
  }
  if (!rows || rows.length === 0) {
    throw new LegacyAdminError(
      409,
      'Candidature introuvable ou déjà accordée.',
      { code: 'already_decided' }
    );
  }

  return {
    result: { ok: true, status: nextStatus },
    // La mise en examen n'est pas une décision : rien au journal.
    audit:
      nextStatus === 'rejected'
        ? {
            action: 'reject_circuit_partner',
            entity_type: 'circuit_partner_application',
            entity_id: id,
            payload: { notes: body.notes },
          }
        : { skip: true },
  };
}
