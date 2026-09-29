// features/player/team/repository/demandes.ts — demandes ENTRANTES d'une
// équipe (`demandes` type `join` / `transfer`) et leurs RPC d'approbation
// (lot P10). Toujours scopé tenant + équipe.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { DemandeRow } from '@/utils/teams/demandeRows';

export type IncomingDemandeType = 'join' | 'transfer';

export async function listTeamDemandes(
  db: AdminDb,
  args: {
    tenantId: string;
    teamId: string;
    type: IncomingDemandeType;
    status: string;
  }
) {
  const { data, error } = await db
    .from('demandes')
    // Colonnes explicites (P4) : celles que la réponse enrichie renvoie.
    .select('id, user_id, status, comment, payload, created_at')
    .eq('team_id', args.teamId)
    .eq('tenant_id', args.tenantId)
    .eq('type', args.type)
    .order('created_at', { ascending: false })
    .eq('status', args.status);
  return { rows: (data ?? []) as unknown as DemandeRow[], error };
}

/** Demande EN ATTENTE de cette équipe, ou `null`. */
export async function readPendingTeamDemande(
  db: AdminDb,
  args: {
    tenantId: string;
    teamId: string;
    type: IncomingDemandeType;
    demandeId: string;
  }
) {
  const { data, error } = await db
    .from('demandes')
    .select('id, user_id, payload')
    .eq('id', args.demandeId)
    .eq('team_id', args.teamId)
    .eq('tenant_id', args.tenantId)
    .eq('type', args.type)
    .eq('status', 'pending')
    .maybeSingle();
  return {
    demande: data as {
      id: string;
      user_id: string | null;
      payload: unknown;
    } | null,
    error,
  };
}

export async function rejectTeamDemande(
  db: AdminDb,
  args: { tenantId: string; demandeId: string; note: string }
) {
  const { error } = await db
    .from('demandes')
    .update({
      status: 'rejected',
      processed_at: new Date().toISOString(),
      staff_note: args.note,
    })
    .eq('id', args.demandeId)
    .eq('tenant_id', args.tenantId);
  return { error };
}

/** Ajout / transfert atomique (verrou, CAS pending→approved, max_players). */
export async function rpcApproveDemande(
  db: AdminDb,
  type: IncomingDemandeType,
  demandeId: string
) {
  const { error } = await db.rpc(
    type === 'join' ? 'approve_join_request' : 'approve_transfer_request',
    { p_demande_id: demandeId }
  );
  return { error };
}
