// pages/api/admin/tenants/[id]/invitations/index.ts
//
// GET  : les invitations d'un espace (vivantes d'abord).
// POST : inviter une adresse à rejoindre l'espace, avec un rôle.
//
// Pourquoi ce lot existe : `POST /tenants/:id/staff` exige un `staff_id` DÉJÀ
// en base et répond `404 STAFF_NOT_FOUND` sinon. Donner un accès à quelqu'un
// qui n'a jamais mis les pieds sur la plateforme demandait donc de lui créer un
// compte à la main, ailleurs, puis de revenir. C'est la friction la plus
// quotidienne de la gestion d'un espace.
//
// Le jeton n'est JAMAIS stocké en clair : seule son empreinte l'est, comme une
// clé d'API. Il ne circule que dans l'email envoyé.
//
// Auth : owner de la plateforme, ou owner/admin rattaché à CET espace. Le rôle
// proposé ne peut pas dépasser celui de l'invitant — sinon l'invitation devient
// une élévation de privilège déguisée.

import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import {
  withStaffRoute,
  hasAtLeastRole,
  STAFF_ROLES,
  type StaffRole,
  type AuthenticatedStaffContext,
} from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { canAccessTenant } from '@/utils/adminTenants';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import { sendEmail } from '@/utils/email';
import { buildInvitationEmail } from '@/utils/tenants/invitationEmail';

/** Deux semaines : le temps d'une absence, pas celui d'un oubli. */
const TTL_DAYS = 14;

const bodySchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(STAFF_ROLES as [StaffRole, ...StaffRole[]]),
});

const sha256 = (v: string) =>
  crypto.createHash('sha256').update(v).digest('hex');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'admin-tenant-invites')
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  switch (req.method) {
    case 'GET':
    case 'POST':
      break;
    default:
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res
      .status(400)
      .json({ error: 'Invalid tenant id.', code: 'INVALID_TENANT_ID' });
  }

  // Inviter engage l'accès à un espace : admin+ global, ou rattaché ici.
  if (!hasAtLeastRole(ctx.role, 'admin')) {
    const isPoleAdmin =
      (ctx.staff as { is_pole_admin?: boolean }).is_pole_admin === true;
    if (!(await canAccessTenant(ctx.staff.id, id, { isPoleAdmin }))) {
      return res.status(403).json({ error: 'No access to this tenant.' });
    }
  }

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('tenant_invitations')
      .select(
        'id, email, role, expires_at, accepted_at, revoked_at, created_at'
      )
      .eq('tenant_id', id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      logger.error('[admin/tenant-invitations] list error', error);
      return res.status(500).json({ error: 'Failed to load invitations.' });
    }

    const now = Date.now();
    const invitations = (data ?? []).map((row) => {
      const r = row as {
        id: string;
        email: string;
        role: string;
        expires_at: string;
        accepted_at: string | null;
        revoked_at: string | null;
        created_at: string;
      };
      // L'état est CALCULÉ : une invitation périmée n'a pas de colonne dédiée,
      // et un cron qui passerait la marquer serait une pièce mobile de plus
      // pour une information déductible d'une date.
      const status = r.accepted_at
        ? 'accepted'
        : r.revoked_at
          ? 'revoked'
          : Date.parse(r.expires_at) <= now
            ? 'expired'
            : 'pending';
      return { ...r, status };
    });

    return res.status(200).json({ invitations });
  }

  // ---------- POST ----------
  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid body',
      code: 'INVALID_BODY',
      details: parsed.error.flatten(),
    });
  }
  const email = parsed.data.email.toLowerCase();
  const role = parsed.data.role;

  // Une invitation ne peut pas donner plus que ce qu'on a soi-même.
  if (!hasAtLeastRole(ctx.role, role)) {
    return res.status(403).json({
      error: 'Le rôle invité ne peut pas dépasser le vôtre.',
      code: 'ROLE_ABOVE_INVITER',
    });
  }

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, name')
    .eq('id', id)
    .maybeSingle();
  if (!tenant) {
    return res
      .status(404)
      .json({ error: 'Tenant not found.', code: 'UNKNOWN_TENANT' });
  }

  // Déjà membre ? Inviter quelqu'un qui est déjà là ne doit pas produire un
  // email inutile, ni laisser croire qu'il manque une étape.
  const { data: existingStaff } = await supabaseAdmin
    .from('staff')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  if (existingStaff?.id) {
    const { data: link } = await supabaseAdmin
      .from('tenant_staff')
      .select('staff_id')
      .eq('tenant_id', id)
      .eq('staff_id', existingStaff.id)
      .maybeSingle();
    if (link) {
      return res.status(409).json({
        error: 'Cette personne fait déjà partie de cet espace.',
        code: 'ALREADY_MEMBER',
      });
    }
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(
    Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  // Une seule invitation vivante par adresse : on remplace la précédente plutôt
  // que d'empiler des jetons valides qu'on ne saurait plus révoquer d'un geste.
  await supabaseAdmin
    .from('tenant_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('tenant_id', id)
    .ilike('email', email)
    .is('accepted_at', null)
    .is('revoked_at', null);

  const { data: created, error } = await supabaseAdmin
    .from('tenant_invitations')
    .insert({
      tenant_id: id,
      email,
      role,
      token_hash: sha256(token),
      invited_by: ctx.staff.id,
      expires_at: expiresAt,
    })
    .select('id, email, role, expires_at, created_at')
    .single();

  if (error) {
    logger.error('[admin/tenant-invitations] insert error', error);
    return res.status(500).json({ error: 'Failed to create invitation.' });
  }

  // L'email part avec le compte d'envoi DE L'ESPACE : c'est lui qui invite, pas
  // la plateforme. Un espace sans compte d'envoi ne peut donc pas inviter — la
  // réponse le dit, plutôt que de laisser une invitation muette en base.
  const t = tenant as { slug: string; name: string };
  const mail = buildInvitationEmail({
    tenantName: t.name,
    role,
    token,
    expiresAt,
  });
  const sent = await sendEmail({
    tenantId: id,
    to: email,
    subject: mail.subject,
    html: mail.html,
  });

  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'other',
      entity_type: 'tenant',
      entity_id: id,
      tenant_id: id,
      payload: {
        action: 'invite_tenant_staff',
        email,
        role,
        emailSent: sent.success === true,
      },
    });
  } catch (logErr) {
    logger.error('logStaffAction(invite_tenant_staff) error:', logErr);
  }

  return res.status(201).json({
    invitation: { ...(created as object), status: 'pending' },
    emailSent: sent.success === true,
    emailError: sent.success === true ? null : (sent.error ?? 'unknown'),
  });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-tenant-invitations' }),
  'caster'
);
