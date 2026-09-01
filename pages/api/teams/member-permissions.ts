// pages/api/teams/member-permissions.ts
//
// Délégation de droits DANS l'équipe (lot J3 de docs/PLAN-espace-joueur.md).
//
//   GET    ?teamId= — les délégations de l'équipe, actives et révoquées
//                     (la table est aussi le journal : « qui a donné quoi »).
//   POST   { userId, permission } — accorde.
//   DELETE { userId, permission } — révoque.
//
// Trois règles, toutes vérifiées ici et nulle part ailleurs :
//
//   1. Déléguer est un geste de ROSTER → l'appelant doit avoir `manage_roster`.
//   2. On ne délègue pas ce qu'on n'a pas soi-même. Sans cette règle, un rôle
//      privilégié partiel pourrait s'auto-élargir en se déléguant le reste.
//   3. La cible doit être membre de l'équipe. Déléguer à quelqu'un du dehors
//      créerait un droit sans appartenance, invisible du roster.
//
// La surcharge est ADDITIVE : elle n'enlève jamais ce que le rôle accorde (cf.
// la migration). Révoquer une permission que le RÔLE donne ne la retire donc
// pas — et l'API le dit plutôt que de faire semblant.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withSubjectRoute } from '@/utils/subject';
import {
  assertTeamPermission,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import { getManagedTeamForRequest } from '@/utils/teams/teamScope';
import {
  isTeamPermission,
  loadTeamRolesFromSupabase,
  roleHasPermission,
  TEAM_PERMISSION_VALUES,
  type TeamPermission,
} from '@/utils/teamRoles';

import { logger } from '../../../utils/logger';

/**
 * Droits d'UN membre, décomposés par SOURCE. L'écran doit pouvoir dire « ça
 * vient de son rôle » (donc non retirable ici) vs « ça a été délégué » (donc
 * révocable) — sans avoir à connaître la config des rôles, qui vit côté
 * serveur dans site_settings.
 */
export type TeamMemberPermissionState = {
  userId: string;
  role: string | null;
  fromRole: TeamPermission[];
  granted: TeamPermission[];
  effective: TeamPermission[];
};

export type TeamPermissionGrant = {
  userId: string;
  permission: TeamPermission;
  grantedBy: string | null;
  createdAt: string;
  revokedAt: string | null;
};

type Body = { userId?: unknown; permission?: unknown };

function readBody(body: Body): {
  userId: string;
  permission: TeamPermission;
} | null {
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  const permission = body?.permission;
  if (!userId || !isTeamPermission(permission)) return null;
  return { userId, permission };
}

export default withSubjectRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { subject }
) {
  if (
    applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'team-member-perms')
  ) {
    return;
  }

  const { userId: callerId, tenantId } = subject;

  const access = await getManagedTeamForRequest(req, callerId, tenantId);
  if (!access) {
    return res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
  }

  // Règle 1 — déléguer est un geste de roster.
  const denied = assertTeamPermission(access, 'manage_roster');
  if (denied) return res.status(denied.status).json({ error: denied.error });

  const teamId = access.teamId;

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('team_member_permissions')
      .select('user_id, permission, granted_by, created_at, revoked_at')
      .eq('tenant_id', tenantId)
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      logger.error('[team/member-permissions] read error', error);
      return res.status(500).json({ error: 'Lecture impossible.' });
    }

    const grants: TeamPermissionGrant[] = (
      (data ?? []) as Record<string, unknown>[]
    ).flatMap((r) => {
      const permission = r.permission;
      if (!isTeamPermission(permission)) return [];
      return [
        {
          userId: r.user_id as string,
          permission,
          grantedBy: (r.granted_by as string | null) ?? null,
          createdAt: r.created_at as string,
          revokedAt: (r.revoked_at as string | null) ?? null,
        },
      ];
    });

    // État par membre, sources séparées. Calculé ici parce que la config des
    // rôles (site_settings.team_roles) n'a rien à faire dans un bundle client.
    const [rolesConfig, membersRes, teamRes] = await Promise.all([
      loadTeamRolesFromSupabase(supabaseAdmin),
      supabaseAdmin
        .from('team_members')
        .select('user_id, role')
        .eq('team_id', teamId)
        .eq('tenant_id', tenantId),
      supabaseAdmin
        .from('teams')
        .select('captain_id')
        .eq('id', teamId)
        .eq('tenant_id', tenantId)
        .maybeSingle(),
    ]);

    if (membersRes.error) {
      logger.error('[team/member-permissions] members error', membersRes.error);
    }
    const captainId =
      (teamRes.data as { captain_id?: string | null } | null)?.captain_id ??
      null;

    const activeByUser = new Map<string, TeamPermission[]>();
    for (const g of grants) {
      if (g.revokedAt) continue;
      const list = activeByUser.get(g.userId) ?? [];
      list.push(g.permission);
      activeByUser.set(g.userId, list);
    }

    const members: TeamMemberPermissionState[] = (
      (membersRes.data ?? []) as {
        user_id: string | null;
        role: string | null;
      }[]
    ).flatMap((m) => {
      if (!m.user_id) return [];
      // La capitaine a tout par définition du rôle — on le dit comme tel pour
      // que l'écran n'offre pas de lui « déléguer » ce qu'elle possède déjà.
      const fromRole =
        m.user_id === captainId
          ? [...TEAM_PERMISSION_VALUES]
          : TEAM_PERMISSION_VALUES.filter((p) =>
              roleHasPermission(rolesConfig, m.role, p)
            );
      const granted = activeByUser.get(m.user_id) ?? [];
      const set = new Set<TeamPermission>([...fromRole, ...granted]);
      return [
        {
          userId: m.user_id,
          role: m.role ?? null,
          fromRole,
          granted: TEAM_PERMISSION_VALUES.filter((p) => granted.includes(p)),
          effective: TEAM_PERMISSION_VALUES.filter((p) => set.has(p)),
        },
      ];
    });

    return res.status(200).json({
      teamId,
      grants,
      members,
      // Ce que l'appelant peut déléguer : jamais plus que ce qu'il a.
      delegatable: access.permissions,
    });
  }

  // Formes POSITIVES volontaires (et non `!== 'POST' && !== 'DELETE'`) : c'est
  // ce que lit le détecteur de dérive OpenAPI
  // (tests/unit/openapiContractDrift.test.ts), et ça se relit mieux.
  const isGrant = req.method === 'POST';
  const isRevoke = req.method === 'DELETE';
  if (!isGrant && !isRevoke) {
    res.setHeader('Allow', 'GET,POST,DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = readBody((req.body ?? {}) as Body);
  if (!parsed) {
    return res.status(400).json({ error: 'userId et permission requis.' });
  }
  const { userId: targetId, permission } = parsed;

  // Règle 2 — on ne délègue que ce qu'on a.
  if (!access.permissions.includes(permission)) {
    return res.status(403).json({
      error: "Tu ne peux pas déléguer un droit que tu n'as pas toi-même.",
    });
  }

  // Règle 3 — la cible appartient à l'équipe.
  const { data: membership, error: memberErr } = await supabaseAdmin
    .from('team_members')
    .select('id')
    .eq('team_id', teamId)
    .eq('tenant_id', tenantId)
    .eq('user_id', targetId)
    .limit(1)
    .maybeSingle();

  if (memberErr) {
    logger.error('[team/member-permissions] membership error', memberErr);
    return res.status(500).json({ error: 'Vérification impossible.' });
  }
  if (!membership) {
    return res
      .status(404)
      .json({ error: "Cette personne n'est pas dans ton équipe." });
  }

  if (isGrant) {
    // Ré-octroi d'une permission déjà active : no-op idempotent (l'index
    // partiel refuserait un doublon, et l'appelant n'a rien fait de mal).
    const { data: existing } = await supabaseAdmin
      .from('team_member_permissions')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('team_id', teamId)
      .eq('user_id', targetId)
      .eq('permission', permission)
      .is('revoked_at', null)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabaseAdmin
        .from('team_member_permissions')
        .insert({
          tenant_id: tenantId,
          team_id: teamId,
          user_id: targetId,
          permission,
          granted_by: callerId,
        });
      if (error) {
        logger.error('[team/member-permissions] grant error', error);
        return res.status(500).json({ error: "L'octroi a échoué." });
      }
    }
    return res
      .status(200)
      .json({ granted: true, permission, userId: targetId });
  }

  const { error: revokeErr } = await supabaseAdmin
    .from('team_member_permissions')
    .update({ revoked_at: new Date().toISOString(), revoked_by: callerId })
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId)
    .eq('user_id', targetId)
    .eq('permission', permission)
    .is('revoked_at', null);

  if (revokeErr) {
    logger.error('[team/member-permissions] revoke error', revokeErr);
    return res.status(500).json({ error: 'La révocation a échoué.' });
  }

  return res.status(200).json({ granted: false, permission, userId: targetId });
});
