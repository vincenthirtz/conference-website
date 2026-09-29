// features/player/demandes/service/casterApplication.ts — candidature pour
// devenir caster/streamer. Déplacé de pages/api/demandes/caster-application
// (lot P11). Le staff la valide via /api/admin/demandes (promotion en staff
// `caster`, effet de bord côté admin).

import { LegacyAdminError } from '@/utils/admin/errors';
import {
  findPendingDemande,
  insertDemande,
  readLatestCasterApplication,
  readStaffRow,
} from '../repository/demandes';
import { CasterApplicationBody } from '../schemas';
import { displayNameOf, type DemandesCtx } from './context';

export async function readMyCasterApplication(ctx: DemandesCtx) {
  const { application, error } = await readLatestCasterApplication(
    ctx.db,
    ctx.tenantId,
    ctx.userId
  );
  if (error) {
    ctx.logger.error('[demandes/caster-application] GET error:', error);
    throw new LegacyAdminError(500, 'Failed to load application.');
  }
  return { application };
}

export async function submitCasterApplication(ctx: DemandesCtx, raw: unknown) {
  const parsed = CasterApplicationBody.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new LegacyAdminError(400, 'Invalid body.', {
      extra: { fieldErrors: parsed.error.flatten().fieldErrors },
    });
  }
  const { db, tenantId, userId, user } = ctx;
  const motivation = parsed.data.motivation || null;
  const portfolioUrl = parsed.data.portfolioUrl || null;

  // Garde 1 : déjà staff actif → ne peut pas (re)postuler.
  const { staff, error: staffErr } = await readStaffRow(db, userId);
  if (staffErr) {
    ctx.logger.error(
      '[demandes/caster-application] staff check error:',
      staffErr
    );
    throw new LegacyAdminError(500, 'Verification error.');
  }
  if (staff && staff.is_active !== false) {
    throw new LegacyAdminError(409, 'Tu fais déjà partie du staff.', {
      code: 'ALREADY_STAFF',
    });
  }

  // Garde 2 : déjà une candidature en attente (même tenant).
  const { pending, error: pendingErr } = await findPendingDemande(
    db,
    tenantId,
    {
      userId,
      types: ['caster_application'],
    }
  );
  if (pendingErr) {
    ctx.logger.error(
      '[demandes/caster-application] pending check error:',
      pendingErr
    );
    throw new LegacyAdminError(500, 'Verification error.');
  }
  if (pending) {
    throw new LegacyAdminError(
      409,
      'Tu as déjà une candidature caster en attente.',
      { code: 'ALREADY_PENDING', extra: { existingDemandeId: pending.id } }
    );
  }

  const { demande, error: insertErr } = await insertDemande(
    db,
    tenantId,
    {
      user_id: userId,
      type: 'caster_application',
      comment: motivation,
      payload: {
        portfolio_url: portfolioUrl,
        user_email: user.email ?? null,
        user_display_name: displayNameOf(user),
      },
    },
    'id, status, created_at'
  );
  if (insertErr || !demande) {
    ctx.logger.error('[demandes/caster-application] insert error:', insertErr);
    throw new LegacyAdminError(500, 'Failed to create application.');
  }

  return {
    application: {
      id: demande.id,
      status: demande.status,
      created_at: demande.created_at,
    },
  };
}
