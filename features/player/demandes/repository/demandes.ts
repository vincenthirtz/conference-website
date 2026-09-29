// features/player/demandes/repository/demandes.ts — accès à `demandes` et aux
// lectures annexes des demandes de la joueuse (lot P11). Toujours scopé
// tenant. Aucune décision ici : les services tranchent.

import type { AdminDb } from '@/utils/admin/serviceContext';

/** Colonnes d'une demande renvoyées au client (contrat historique). */
export const DEMANDE_COLUMNS =
  'id, type, status, user_id, team_id, tournament_id, comment, staff_note, payload, created_at, updated_at, processed_at';

/** Idem + l'équipe ciblée (listes « join », « transfer », « scrim »). */
const DEMANDE_WITH_TEAM_COLUMNS = `${DEMANDE_COLUMNS}, team:teams!team_id(id, name, short_name, logo_url)`;

export type DemandeType =
  | 'join'
  | 'transfer'
  | 'captain_request'
  | 'scrim'
  | 'team_registration'
  | 'caster_application';

/** Demandes d'un type émises par `userId`, plus récentes d'abord. */
export async function listMyDemandes(
  db: AdminDb,
  tenantId: string,
  userId: string,
  type: DemandeType,
  opts: { withTeam?: boolean } = {}
) {
  const { data, error } = await db
    .from('demandes')
    .select(opts.withTeam ? DEMANDE_WITH_TEAM_COLUMNS : DEMANDE_COLUMNS)
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('type', type)
    .order('created_at', { ascending: false });
  return { demandes: (data ?? []) as unknown[], error };
}

export type PendingFilter = {
  userId?: string;
  teamId?: string;
  tournamentId?: string;
  types: DemandeType[];
};

/**
 * Demande `pending` qui correspond au filtre (une au plus : les index
 * partiels garantissent l'unicité côté base pour les cas qui comptent).
 */
export async function findPendingDemande(
  db: AdminDb,
  tenantId: string,
  filter: PendingFilter
) {
  let q = db
    .from('demandes')
    .select('id, status, team_id, type')
    .eq('tenant_id', tenantId);
  if (filter.userId) q = q.eq('user_id', filter.userId);
  if (filter.teamId) q = q.eq('team_id', filter.teamId);
  if (filter.tournamentId) q = q.eq('tournament_id', filter.tournamentId);
  q =
    filter.types.length === 1
      ? q.eq('type', filter.types[0])
      : q.in('type', filter.types);
  const { data, error } = await q.eq('status', 'pending').maybeSingle();
  return {
    pending: data as {
      id: string;
      status: string;
      team_id: string | null;
      type: string;
    } | null,
    error,
  };
}

export type DemandeInsert = {
  user_id: string;
  team_id?: string | null;
  tournament_id?: string | null;
  type: DemandeType;
  comment: string | null;
  payload: Record<string, unknown>;
};

/** Crée une demande `pending` d'origine site. */
export async function insertDemande(
  db: AdminDb,
  tenantId: string,
  row: DemandeInsert,
  columns: string = DEMANDE_COLUMNS
) {
  const { data, error } = await db
    .from('demandes')
    .insert({
      ...row,
      status: 'pending',
      source: 'website',
      tenant_id: tenantId,
    } as never)
    .select(columns)
    .single();
  return { demande: data as unknown as Record<string, unknown> | null, error };
}

/** Propriétaire d'une demande (contrôle d'accès de l'annulation). */
export async function readDemandeOwner(
  db: AdminDb,
  tenantId: string,
  demandeId: string
) {
  const { data, error } = await db
    .from('demandes')
    .select('id, user_id')
    .eq('id', demandeId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { demande: data as { id: string; user_id: string } | null, error };
}

/**
 * Annulation atomique : UPDATE conditionné par `status='pending'`. 0 ligne
 * rendue = la demande n'était plus en attente (le CAS fait foi, pas une
 * lecture préalable).
 */
export async function cancelPendingDemande(
  db: AdminDb,
  tenantId: string,
  demandeId: string
) {
  const { data, error } = await db
    .from('demandes')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', demandeId)
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .select('id');
  return { updated: (data ?? []) as { id: string }[], error };
}

/** Dernière candidature caster de `userId`. */
export async function readLatestCasterApplication(
  db: AdminDb,
  tenantId: string,
  userId: string
) {
  const { data, error } = await db
    .from('demandes')
    .select('id, status, comment, created_at, processed_at')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('type', 'caster_application')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { application: data ?? null, error };
}

/** Fiche staff de l'utilisateur (garde « déjà staff » de la candidature). */
export async function readStaffRow(db: AdminDb, userId: string) {
  const { data, error } = await db
    .from('staff')
    .select('id, is_active')
    .eq('auth_user_id', userId)
    .maybeSingle();
  return {
    staff: data as { id: string; is_active: boolean | null } | null,
    error,
  };
}
