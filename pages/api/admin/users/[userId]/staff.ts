// pages/api/admin/users/[userId]/staff.ts
//
// GET — la FICHE STAFF d'un compte : son rôle de plateforme, son état, et les
// espaces où il administre.
//
// POURQUOI UN ENDPOINT DE PLUS. `/profile` rend les métadonnées du compte AUTH
// (pseudo, BattleTag, avatar) et son équipe : ce qu'il faut pour les vues
// joueuse et capitaine. Rien n'y dit ce qu'on vient chercher ici — la ligne
// `staff`, et surtout `tenant_staff`, c'est-à-dire CHEZ QUI cette personne a du
// pouvoir. Ajouter ces champs à `/profile` les aurait servis aux deux autres
// vues, qui n'en ont pas l'usage et dont le droit d'accès est plus large.
//
// DEUX DIMENSIONS, JAMAIS CONFONDUES (cf. utils/staff.ts). `staff.role` dit ce
// qu'on est sur la PLATEFORME ; `tenant_staff.role` ce qu'on est CHEZ un
// espace, et il ÉLÈVE sans déborder. Les afficher côte à côte est tout l'objet
// de cette fiche : c'est en les confondant qu'on a créé un partenaire en
// `admin` global, ce qui lui ouvrait les adhérents et les campagnes email de
// l'association.
//
// Auth : `manage_staff`. C'est le droit qui redistribue le pouvoir, et cette
// fiche dit précisément qui en détient. Portée PLATEFORME : la question « chez
// qui cette personne administre-t-elle ? » n'a pas de réponse cantonnée à un
// espace.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-user-staff')
  ) {
    return;
  }
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Database service unavailable.' });
  }
  res.setHeader('Cache-Control', 'private, no-store');

  const raw = req.query.userId;
  const userId = typeof raw === 'string' ? raw.trim() : '';
  if (!isValidUUID(userId)) {
    return res
      .status(400)
      .json({ error: 'userId invalide.', code: 'INVALID_USER_ID' });
  }

  // La clé est l'id du compte AUTH : c'est ce que manipule l'écran appelant.
  const { data: staffRow, error: staffErr } = await supabaseAdmin
    .from('staff')
    .select(
      'id, auth_user_id, email, display_name, role, is_active, is_pole_admin, created_at'
    )
    .eq('auth_user_id', userId)
    .maybeSingle();

  if (staffErr) {
    logger.error('[admin/users/staff] lecture staff impossible', staffErr);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  if (!staffRow) {
    // Le compte existe peut-être, mais il n'est pas staff : c'est la fiche qui
    // est introuvable, pas la personne.
    return res
      .status(404)
      .json({ error: 'Ce compte n’est pas staff.', code: 'NOT_STAFF' });
  }

  const { data: attachments, error: attErr } = await supabaseAdmin
    .from('tenant_staff')
    .select('tenant_id, role, created_at, tenants(name, slug, is_active)')
    .eq('staff_id', staffRow.id);

  if (attErr) {
    logger.error('[admin/users/staff] rattachements illisibles', attErr);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  type AttachmentRow = {
    tenant_id: string;
    role: string | null;
    created_at: string | null;
    tenants: { name: string; slug: string; is_active: boolean } | null;
  };

  const spaces = ((attachments ?? []) as unknown as AttachmentRow[]).map(
    (row) => ({
      tenantId: row.tenant_id,
      name: row.tenants?.name ?? null,
      slug: row.tenants?.slug ?? null,
      isActive: row.tenants?.is_active ?? null,
      role: row.role,
      since: row.created_at,
    })
  );

  // Consulter qui détient quel pouvoir est un geste qui se trace, au même titre
  // que la consultation d'une fiche joueuse.
  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'other',
      entity_type: 'user',
      entity_id: userId,
      tenant_id: ctx.tenantId,
      payload: { action: 'view_staff_record', targetStaffId: staffRow.id },
    });
  } catch (logErr) {
    logger.error('[admin/users/staff] audit log failed:', logErr);
  }

  return res.status(200).json({
    staff: {
      id: staffRow.id,
      authUserId: staffRow.auth_user_id,
      email: staffRow.email,
      displayName: staffRow.display_name,
      role: staffRow.role,
      isActive: staffRow.is_active,
      isPoleAdmin: staffRow.is_pole_admin,
      createdAt: staffRow.created_at,
    },
    spaces,
  });
}

export default withStaffRoute(handler, {
  permission: 'manage_staff',
  scope: 'platform',
});
