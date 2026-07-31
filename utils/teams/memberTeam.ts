// utils/teams/memberTeam.ts
//
// Équipe d'un utilisateur en tant que MEMBRE — à ne pas confondre avec
// `getManagedTeam`, qui répond « quelle équipe cette personne GÈRE ».
//
// La distinction n'est pas cosmétique : la quasi-totalité des routes d'équipe
// passent par `getManagedTeam` et sont donc, à raison, réservées à la gestion.
// Mais certaines surfaces sont délibérément OUVERTES à tout le roster — le
// rythme d'équipe (N1), la mémoire d'équipe (N2) — parce que c'est exactement
// ce qui manquait : sans elles, une équipe se résume à une personne qui vient
// et quatre qui ne viennent jamais.
//
// Règle métier existante : un compte n'appartient qu'à une équipe par tenant
// (`maybeSingle` s'appuie dessus, comme `network-status` et `player/matches`).
//
// Deux lectures plates plutôt qu'un embed PostgREST : la forme d'un embed
// (objet ou tableau) dépend de la cardinalité déduite de la FK, ce qui se prête
// mal à un cast — et c'est le point d'entrée d'autorisation de ces routes.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

export type MemberTeam = { id: string; name: string };

export async function findMemberTeam(
  userId: string,
  tenantId: string
): Promise<MemberTeam | null> {
  if (!supabaseAdmin || !userId) return null;

  const { data: member, error } = await supabaseAdmin
    .from('team_members')
    .select('team_id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) {
    logger.error('[memberTeam] member lookup error', error);
    return null;
  }
  const teamId = (member as { team_id?: string | null } | null)?.team_id;
  if (!teamId) return null;

  const { data: team, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, name, is_active, deleted_at')
    .eq('id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (teamErr) {
    logger.error('[memberTeam] team lookup error', teamErr);
    return null;
  }
  const row = team as {
    id: string;
    name: string;
    is_active: boolean | null;
    deleted_at: string | null;
  } | null;
  if (!row || row.deleted_at || row.is_active === false) return null;
  return { id: row.id, name: row.name };
}
