// Centralise la notion de "user pouvant gerer une team" : capitaine OU manager.
// Les API routes qui geraient le roster, les scrims, les messages capitaine,
// etc. doivent appeler ce helper plutot que de checker directement teams.captain_id.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

export type TeamManagementAccess = {
  teamId: string;
  /** true si l'user est le captain_id de l'equipe */
  isCaptain: boolean;
  /** true si l'user a team_members.role = 'manager' dans cette equipe */
  isManager: boolean;
};

/**
 * Retourne la team que l'user gere (en tant que capitaine OU manager d'equipe),
 * ou null s'il n'a aucun droit de gestion.
 *
 * Regles :
 *  - Un user n'a au plus qu'une "team manageriale" : on est capitaine d'une seule
 *    equipe, et on est manager dans une seule equipe (pas plus, c'est metier).
 *  - Si on est capitaine d'une equipe ET manager d'une autre, on retourne celle
 *    dont on est capitaine (priorite la plus forte).
 *  - On ne considere que les teams actives (is_active = true).
 */
export async function getManagedTeam(
  userId: string
): Promise<TeamManagementAccess | null> {
  if (!userId) return null;
  if (!supabaseAdmin) {
    logger.error('[getManagedTeam] supabaseAdmin unavailable');
    return null;
  }

  // 1. Capitaine ?
  const { data: captainTeam, error: captainErr } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('captain_id', userId)
    .maybeSingle();

  if (captainErr) {
    logger.error('[getManagedTeam] captain query error', captainErr);
  }

  if (captainTeam?.id) {
    return { teamId: captainTeam.id, isCaptain: true, isManager: false };
  }

  // 2. Manager d'une team ?
  const { data: managerRow, error: mgrErr } = await supabaseAdmin
    .from('team_members')
    .select('team_id')
    .eq('user_id', userId)
    .eq('role', 'manager')
    .maybeSingle();

  if (mgrErr) {
    logger.error('[getManagedTeam] manager query error', mgrErr);
  }

  if (managerRow?.team_id) {
    return {
      teamId: managerRow.team_id,
      isCaptain: false,
      isManager: true,
    };
  }

  return null;
}

/** Petit helper pour les messages d'erreur uniformes. */
export const TEAM_MANAGEMENT_FORBIDDEN =
  "Tu dois etre capitaine ou manager d'une equipe active.";
