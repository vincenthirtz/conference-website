import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { applyRateLimit } from '@/utils/rateLimit';
import {
  TEAM_ROLES_SETTING_KEY,
  loadTeamRolesFromSupabase,
  serializeTeamRoles,
  isTeamPermission,
  TEAM_PERMISSION_VALUES,
  type TeamRole,
  type TeamPermission,
} from '@/utils/teamRoles';
import { logger } from '@/utils/logger';

const ROLE_VALUE_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-team-roles')
  )
    return;

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  if (req.method === 'GET') {
    try {
      const roles = await loadTeamRolesFromSupabase(supabaseAdmin);
      return res.status(200).json({ roles });
    } catch (err) {
      logger.error('[admin/team-roles] GET error', err);
      return res.status(500).json({ error: 'Failed to load team roles.' });
    }
  }

  if (req.method === 'PUT') {
    const body = req.body as { roles?: unknown } | undefined;
    if (!body || !Array.isArray(body.roles)) {
      return res
        .status(400)
        .json({ error: 'Body must contain a roles array.' });
    }

    const cleaned: TeamRole[] = [];
    const seen = new Set<string>();

    for (const item of body.roles as Array<{
      value?: unknown;
      label?: unknown;
      permissions?: unknown;
    }>) {
      const value =
        typeof item?.value === 'string' ? item.value.trim().toLowerCase() : '';
      const label =
        typeof item?.label === 'string' && item.label.trim()
          ? item.label.trim()
          : '';

      if (!value) {
        return res.status(400).json({ error: 'Each role needs a value.' });
      }
      if (!ROLE_VALUE_RE.test(value)) {
        return res.status(400).json({
          error: `Invalid role value "${value}" (use lowercase letters, digits, "-" or "_").`,
        });
      }
      if (seen.has(value)) {
        return res
          .status(400)
          .json({ error: `Duplicate role value "${value}".` });
      }
      seen.add(value);

      const rawPermissions = Array.isArray(item.permissions)
        ? item.permissions
        : [];
      const permSeen = new Set<TeamPermission>();
      for (const p of rawPermissions) {
        if (!isTeamPermission(p)) {
          return res.status(400).json({
            error: `Invalid permission "${String(p)}" for role "${value}".`,
          });
        }
        permSeen.add(p);
      }
      const permissions = TEAM_PERMISSION_VALUES.filter((p) => permSeen.has(p));

      cleaned.push({
        value,
        label: label || value.charAt(0).toUpperCase() + value.slice(1),
        permissions,
      });
    }

    if (cleaned.length === 0) {
      return res.status(400).json({ error: 'At least one role required.' });
    }

    const { error } = await supabaseAdmin.from('site_settings').upsert(
      {
        // Les rôles d'équipe deviennent configurables PAR TENANT (lot A8) —
        // c'est ce qui débloque la délégation par équipe côté joueur (J3).
        tenant_id: ctx.tenantId,
        key: TEAM_ROLES_SETTING_KEY,
        value: serializeTeamRoles(cleaned),
        description: "Liste des rôles disponibles pour les membres d'équipe",
        updated_by: ctx.staff.id,
      },
      { onConflict: 'tenant_id,key' }
    );

    if (error) {
      logger.error('[admin/team-roles] upsert error', error);
      return res.status(500).json({ error: 'Failed to save team roles.' });
    }

    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'other',
      entity_type: 'site_settings',
      entity_id: TEAM_ROLES_SETTING_KEY,
      payload: { count: cleaned.length },
    });

    return res.status(200).json({ roles: cleaned });
  }

  res.setHeader('Allow', 'GET,PUT');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
