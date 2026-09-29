// features/player/scrims/repository/requests.ts — demandes de scrim
// (`demandes` type='scrim') et équipe gérée. Toujours scopé tenant.

import type { AdminDb } from '@/utils/admin/serviceContext';

export type ScrimDemandeRow = {
  id: string;
  user_id: string | null;
  source: string | null;
  status: string;
  comment: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

const DEMANDE_COLUMNS =
  'id, user_id, source, status, comment, payload, created_at';

export async function readTeamIdentity(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const { data, error } = await db
    .from('teams')
    .select('id, name, logo_url')
    .eq('id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return {
    team: data as { id: string; name: string; logo_url: string | null } | null,
    error,
  };
}

/**
 * Demandes scrim `pending` où l'équipe est participante, dans les DEUX sens
 * (cible via `team_id`, demandeuse via `payload.from_team_id`). Deux requêtes
 * plutôt qu'un `.or()` : le mock de tests traite `.or()` comme un no-op.
 */
export async function listPendingScrimDemandes(
  db: AdminDb,
  tenantId: string,
  teamId: string
) {
  const [asTarget, asRequester] = await Promise.all([
    db
      .from('demandes')
      .select(DEMANDE_COLUMNS)
      .eq('team_id', teamId)
      .eq('tenant_id', tenantId)
      .eq('type', 'scrim')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    db
      .from('demandes')
      .select(DEMANDE_COLUMNS)
      .filter('payload->>from_team_id', 'eq', teamId)
      .eq('tenant_id', tenantId)
      .eq('type', 'scrim')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  ]);
  return {
    rows: [
      ...((asTarget.data ?? []) as unknown as ScrimDemandeRow[]),
      ...((asRequester.data ?? []) as unknown as ScrimDemandeRow[]),
    ],
    error: asTarget.error || asRequester.error,
  };
}
