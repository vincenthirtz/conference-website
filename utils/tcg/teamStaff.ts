// utils/tcg/teamStaff.ts
//
// L'ENCADREMENT D'UNE ÉQUIPE (coach, manager) TOUCHE LES MÊMES RÉCOMPENSES TCG
// QUE SES JOUEUSES. Décision produit du 2026-10-24 : Shaki, coach des
// Chocomates championnes de la Cup 2026, n'avait reçu que son cadeau d'accueil
// — ni les sept victoires, ni la défaite, ni le titre, quand chaque titulaire
// en tirait douze paquets. Onze comptes d'encadrement étaient dans ce cas.
//
// POURQUOI L'ENCADREMENT EN ÉTAIT EXCLU. Les écrivains suivaient les feuilles
// de match (`match_participants`), et ces feuilles écartent volontairement le
// coach et la manager : les y faire figurer leur donnerait un rating Glicko-2
// pour des matchs qu'ils n'ont pas joués (cf. `snapshotMatchParticipants`). La
// feuille reste donc ce qu'elle est ; c'est la RÉCOMPENSE qui s'élargit.
//
// L'ENCADREMENT EST LU AU MOMENT DE LA RÉCOMPENSE (`team_members` courant) :
// aucune feuille ne le fige. Un coach arrivé après un match ne touche pas ce
// match, puisque la récompense a déjà été écrite ; un rejeu (score corrigé,
// finalisation relancée) le paie, comme il paierait une gagnante oubliée.
//
// UNE LECTURE EN ÉCHEC N'EST PAS UN ENCADREMENT VIDE : `null`, jamais une Map
// vide. Chaque appelant décide de sa posture (payer les joueuses quand même,
// ou s'abstenir), mais il doit le décider en connaissance de cause.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { isNonPlayingTeamRole } from '@/utils/teams/roleKind';

/**
 * Comptes d'encadrement (coach, manager) de ces équipes, par équipe.
 * Une équipe sans encadrement n'a pas d'entrée. `null` = lecture en échec.
 */
export async function readTeamStaff(
  tenantId: string,
  teamIds: readonly string[]
): Promise<Map<string, string[]> | null> {
  const ids = [...new Set(teamIds.filter(Boolean))];
  const byTeam = new Map<string, string[]>();
  if (ids.length === 0) return byTeam;
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from('team_members')
    .select('team_id, user_id, role')
    .eq('tenant_id', tenantId)
    .in('team_id', ids);
  if (error) {
    logger.error('[tcg/team-staff] encadrement illisible: %s', error.message);
    return null;
  }

  for (const row of (data ?? []) as Array<{
    team_id: string | null;
    user_id: string | null;
    role: string | null;
  }>) {
    if (!row.team_id || !row.user_id || !isNonPlayingTeamRole(row.role))
      continue;
    const list = byTeam.get(row.team_id) ?? [];
    if (!list.includes(row.user_id)) list.push(row.user_id);
    byTeam.set(row.team_id, list);
  }
  return byTeam;
}
