// Vérification runtime des permissions d'un user sur une team.
//   - Le capitaine de la team a TOUTES les permissions, indépendamment de son
//     rôle dans team_members.
//   - Sinon, on lit team_members.role + la config courante des rôles
//     (utils/teamRoles.ts) et on regarde si ce rôle accorde la permission.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import {
  loadTeamRolesFromSupabase,
  roleHasPermission,
  type TeamPermission,
} from '@/utils/teamRoles';

export async function hasTeamPermission(
  userId: string | null | undefined,
  teamId: string | null | undefined,
  permission: TeamPermission
): Promise<boolean> {
  if (!userId || !teamId) return false;
  if (!supabaseAdmin) {
    logger.error('[hasTeamPermission] supabaseAdmin unavailable');
    return false;
  }

  const { data: team, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('captain_id')
    .eq('id', teamId)
    .maybeSingle();

  if (teamErr) {
    logger.error('[hasTeamPermission] team lookup error', teamErr);
    return false;
  }
  if (!team) return false;

  if ((team as { captain_id?: string | null }).captain_id === userId) {
    return true;
  }

  const { data: member, error: memberErr } = await supabaseAdmin
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle();

  if (memberErr) {
    logger.error('[hasTeamPermission] member lookup error', memberErr);
    return false;
  }
  if (!member) return false;

  const roles = await loadTeamRolesFromSupabase(supabaseAdmin);
  return roleHasPermission(
    roles,
    (member as { role?: string | null }).role,
    permission
  );
}
