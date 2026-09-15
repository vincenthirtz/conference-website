// utils/teams/loadTeamInTenant.ts
//
// « Cette équipe appartient-elle à l'espace de la personne qui agit ? »
//
// POURQUOI UN HELPER. Plusieurs routes staff chargeaient l'équipe par son seul
// `id` (`/api/admin/teams/[teamId]/members`, `roster-bulk`, `add-member`) puis
// lisaient ou écrivaient son roster. Toutes les tables sont partagées entre
// espaces : un `owner` de n'importe quel espace — y compris un espace développeur
// créé en libre-service — pouvait lire le roster d'une équipe d'un AUTRE espace,
// y ajouter un compte (ce qui fabrique un « rattachement » à son espace, cf.
// `utils/tcg/tenantAttachment.ts`), le modifier ou en retirer des membres.
//
// LA RÈGLE : on filtre sur `tenant_id` DANS la requête, avant tout le reste.
// Une équipe d'un autre espace répond 404, exactement comme une équipe qui
// n'existe pas — ne pas confirmer son existence. Une LECTURE EN ÉCHEC n'est pas
// une absence : 500, et rien n'est écrit (le 404 conclurait « elle n'existe
// pas » sur une panne réseau).

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

export type TeamInTenantResult<T> =
  | { ok: true; team: T }
  | { ok: false; status: 404 | 500; error: string };

export async function loadTeamInTenant<T = { id: string }>(
  teamId: string,
  tenantId: string,
  columns = 'id'
): Promise<TeamInTenantResult<T>> {
  if (!supabaseAdmin) {
    return { ok: false, status: 500, error: 'Supabase not configured' };
  }
  const { data, error } = await supabaseAdmin
    .from('teams')
    .select(columns)
    .eq('id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) {
    logger.error('[teams/in-tenant] lecture impossible', error, { teamId });
    return { ok: false, status: 500, error: 'Failed to read team' };
  }
  if (!data) return { ok: false, status: 404, error: 'Team not found' };
  return { ok: true, team: data as T };
}
