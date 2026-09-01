// pages/api/admin/users/[userId]/permissions.ts
//
// Accorder ou retirer des permissions À L'UNITÉ sur une fiche staff.
//
// Clé = l'id du COMPTE AUTH, pas `staff.id` : l'écran appelant
// (`/admin/users/manage`) manipule des comptes, et lui faire résoudre un second
// identifiant pour chaque ligne serait une jointure de plus pour rien.
//
// GET  → { role, rolePermissions, extraPermissions, effective, grantable }
// PUT  { extraPermissions: string[] } → remplace la liste accordée
//
// Auth : `manage_staff` — c'est le droit qui redistribue le pouvoir.
//
// LA RÈGLE QUI COMPTE : on ne peut accorder QUE ce qu'on détient soi-même.
// Sans elle, `manage_staff` serait le seul droit qui existe : un admin
// s'accorderait `manage_tenant` — qu'aucun rôle sauf `owner` ne porte — et se
// hisserait au-dessus de son propre rôle. Un droit ne se crée pas, il se
// délègue.
//
// Les permissions accordées ne font qu'AJOUTER à celles du rôle, jamais
// retirer : « retirer » un droit du rôle n'existe pas, on change de rôle.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import {
  effectiveStaffPermissions,
  grantableStaffPermissions,
  isStaffPermission,
  staffPermissionsFor,
  type StaffPermission,
} from '@/utils/staffPermissions';
import { STAFF_ROLES, type StaffRole } from '@/utils/staff';

type TargetRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  role: string;
  extra_permissions: string[] | null;
};

function asRole(value: unknown): StaffRole | null {
  return (STAFF_ROLES as readonly string[]).includes(String(value))
    ? (value as StaffRole)
    : null;
}

async function loadTarget(userId: string): Promise<TargetRow | null> {
  const { data, error } = await supabaseAdmin
    .from('staff')
    .select('id, display_name, email, role, extra_permissions')
    .eq('auth_user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as TargetRow | null) ?? null;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const userId = String(req.query.userId ?? '');
  if (!userId) {
    res.status(400).json({ error: 'userId requis.' });
    return;
  }

  const isRead = req.method === 'GET';
  const isWrite = req.method === 'PUT';
  if (!isRead && !isWrite) {
    res.setHeader('Allow', 'GET, PUT');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (applyRateLimit(req, res, { max: 30, windowMs: 60_000 })) return;

  const grantable = grantableStaffPermissions(
    ctx.role,
    ctx.staff.extra_permissions
  );

  try {
    const target = await loadTarget(userId);
    if (!target) {
      // Pas une erreur technique : on ne peut pas accorder une permission STAFF
      // à un compte qui n'est pas membre du staff. Le message le dit.
      res.status(404).json({ error: 'Ce compte n’est pas membre du staff.' });
      return;
    }
    const targetRole = asRole(target.role);

    if (isRead) {
      res.status(200).json({
        staffId: target.id,
        userId,
        displayName: target.display_name,
        email: target.email,
        role: target.role,
        rolePermissions: staffPermissionsFor(targetRole),
        extraPermissions: target.extra_permissions ?? [],
        effective: effectiveStaffPermissions(
          targetRole,
          target.extra_permissions
        ),
        // Ce que l'APPELANT peut cocher. Le reste s'affiche désactivé : masquer
        // un droit qu'on ne peut pas donner ferait croire qu'il n'existe pas.
        grantable,
      });
      return;
    }

    const raw = (req.body ?? {}) as { extraPermissions?: unknown };
    if (!Array.isArray(raw.extraPermissions)) {
      res.status(400).json({ error: 'extraPermissions doit être un tableau.' });
      return;
    }

    const requested: StaffPermission[] = [];
    for (const value of raw.extraPermissions) {
      if (!isStaffPermission(value)) {
        res
          .status(400)
          .json({ error: `Permission inconnue : ${String(value)}` });
        return;
      }
      if (!requested.includes(value)) requested.push(value);
    }

    const previous = (target.extra_permissions ?? []).filter(isStaffPermission);

    // On ne juge que ce qui CHANGE. Une liste héritée peut contenir un droit
    // que l'appelant n'a pas ; le lui faire retirer par accident, ou lui
    // interdire toute modification à cause de lui, seraient tous deux faux.
    const added = requested.filter((p) => !previous.includes(p));
    const removed = previous.filter((p) => !requested.includes(p));
    const refused = [...added, ...removed].filter(
      (p) => !grantable.includes(p)
    );
    if (refused.length > 0) {
      res.status(403).json({
        error: `Vous ne pouvez pas accorder ou retirer un droit que vous n’avez pas : ${refused.join(', ')}.`,
      });
      return;
    }

    // Stocker ce que le rôle couvre déjà serait trompeur : la fiche afficherait
    // un droit « accordé » qui ne change rien aujourd'hui, et qui SURVIVRAIT à
    // une rétrogradation — donnant alors plus que le nouveau rôle.
    const rolePermissions = staffPermissionsFor(targetRole);
    const stored = requested.filter((p) => !rolePermissions.includes(p));

    const { error } = await supabaseAdmin
      .from('staff')
      .update({ extra_permissions: stored })
      .eq('id', target.id);
    if (error) throw error;

    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'update_staff_permissions',
      entity_type: 'staff',
      entity_id: target.id,
      tenant_id: ctx.tenantId,
      permission: 'manage_staff',
      payload: {
        target: target.display_name ?? target.email,
        added,
        removed,
        result: stored,
      },
    });

    res.status(200).json({
      extraPermissions: stored,
      effective: effectiveStaffPermissions(targetRole, stored),
    });
  } catch (err) {
    logger.error('[admin/staff/permissions] failed', err);
    res.status(500).json({ error: 'Opération impossible.' });
  }
}

export default withStaffRoute(handler, { permission: 'manage_staff' });
