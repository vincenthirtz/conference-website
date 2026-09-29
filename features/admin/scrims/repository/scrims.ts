// features/admin/scrims/repository/scrims.ts — accès base des scrims côté
// staff (scrims, leurs matchs, leurs casters, l'agenda, le transfert d'une
// demande externe). `tenantId` est un paramètre OBLIGATOIRE de chaque
// fonction : une requête non scopée ne s'écrit pas par accident.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { TablesInsert, TablesUpdate } from '@/types/database.generated';
import {
  FORWARD_DEMANDE_COLUMNS,
  MATCH_ROW_COLUMNS,
  SCRIM_CAST_ASSIGNMENT_COLUMNS,
  SCRIM_DETAIL_COLUMNS,
  SCRIM_LIST_COLUMNS,
  SCRIM_MATCH_LIST_COLUMNS,
  SCRIM_RESULT_BEFORE_COLUMNS,
  SCRIM_ROW_COLUMNS,
} from '../schemas';

/* ---- Liste / création ---- */

export type ScrimListFilters = {
  withCount: boolean;
  includeDeleted: boolean;
  status: string | null;
  teamId: string | null;
  search: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  orderBy: 'scheduled_date' | 'created_at';
  ascending: boolean;
  offset: number;
  limit: number;
};

export async function listScrims(
  db: AdminDb,
  tenantId: string,
  f: ScrimListFilters
) {
  let query = db
    .from('scrims')
    .select(SCRIM_LIST_COLUMNS, {
      count: f.withCount ? 'exact' : undefined,
    })
    .eq('tenant_id', tenantId);

  // Filtre soft-delete : par défaut on cache les scrims supprimés. Pour
  // l'admin "recycle bin", passer includeDeleted=1.
  if (!f.includeDeleted) query = query.is('deleted_at', null);
  if (f.status) query = query.eq('status', f.status);
  if (f.teamId) {
    query = query.or(`team1_id.eq.${f.teamId},team2_id.eq.${f.teamId}`);
  }
  if (f.search) {
    const s = `%${f.search}%`;
    query = query.or(`name.ilike.${s},slug.ilike.${s}`);
  }
  if (f.dateFrom) query = query.gte('scheduled_date', f.dateFrom);
  if (f.dateTo) query = query.lte('scheduled_date', f.dateTo);

  const { data, error, count } = await query
    .order(f.orderBy, { ascending: f.ascending })
    .range(f.offset, f.offset + f.limit - 1);
  return { rows: data ?? [], count, error };
}

/** Un autre scrim du tenant porte-t-il déjà ce slug ? */
export async function findScrimIdBySlug(
  db: AdminDb,
  tenantId: string,
  slug: string,
  excludeId?: string
) {
  let query = db
    .from('scrims')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('slug', slug);
  if (excludeId) query = query.neq('id', excludeId);
  const { data } = await query.maybeSingle();
  return data ?? null;
}

export async function insertScrim(
  db: AdminDb,
  payload: TablesInsert<'scrims'> & { tenant_id: string }
) {
  const { data, error } = await db
    .from('scrims')
    .insert(payload)
    .select(SCRIM_ROW_COLUMNS)
    .maybeSingle();
  return { row: data ?? null, error };
}

/* ---- Fiche / mise à jour / corbeille ---- */

export async function getScrimDetail(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { data, error } = await db
    .from('scrims')
    .select(SCRIM_DETAIL_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function countScrimMatches(
  db: AdminDb,
  tenantId: string,
  scrimId: string
) {
  const { count } = await db
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('scrim_id', scrimId);
  return count ?? null;
}

/** Ligne complète (corbeille comprise) — état « avant » d'un PATCH / DELETE. */
export async function getScrimRow(db: AdminDb, tenantId: string, id: string) {
  const { data } = await db
    .from('scrims')
    .select(SCRIM_ROW_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data ?? null;
}

/**
 * Mise à jour d'un scrim. `expectedStatus` rend l'écriture conditionnelle au
 * statut lu : aucune ligne rendue = le scrim a changé entre-temps.
 */
export async function updateScrim(
  db: AdminDb,
  tenantId: string,
  id: string,
  patch: TablesUpdate<'scrims'>,
  expectedStatus: string | null
) {
  let query = db
    .from('scrims')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', tenantId);
  if (expectedStatus) query = query.eq('status', expectedStatus);
  const { data, error } = await query.select(SCRIM_ROW_COLUMNS).maybeSingle();
  return { row: data ?? null, error };
}

export async function softDeleteScrim(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const now = new Date().toISOString();
  const { error } = await db
    .from('scrims')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id)
    .eq('tenant_id', tenantId);
  return { error };
}

/** État lu avant la saisie d'un score (hors corbeille). */
export async function getScrimForResult(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { data, error } = await db
    .from('scrims')
    .select(SCRIM_RESULT_BEFORE_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();
  return { row: data ?? null, error };
}

/* ---- Agenda ---- */

export async function listCalendarScrims(
  db: AdminDb,
  tenantId: string,
  from: string,
  to: string
) {
  const { data } = await db
    .from('scrims')
    .select(
      'id, name, status, scheduled_date, duration_minutes, team1_id, team2_id'
    )
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .not('scheduled_date', 'is', null)
    .gte('scheduled_date', from)
    .lte('scheduled_date', to);
  return data ?? [];
}

export async function listCalendarMatches(
  db: AdminDb,
  tenantId: string,
  from: string,
  to: string
) {
  const { data } = await db
    .from('matches')
    .select('id, status, scheduled_at, team1_id, team2_id')
    .eq('tenant_id', tenantId)
    .not('scheduled_at', 'is', null)
    .gte('scheduled_at', from)
    .lte('scheduled_at', to);
  return data ?? [];
}

export async function listTeamNames(
  db: AdminDb,
  tenantId: string,
  ids: string[]
) {
  const { data } = await db
    .from('teams')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .in('id', ids);
  return data ?? [];
}

/* ---- Matchs d'un scrim ---- */

export async function listScrimMatches(
  db: AdminDb,
  tenantId: string,
  scrimId: string
) {
  const { data, error } = await db
    .from('matches')
    .select(SCRIM_MATCH_LIST_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('scrim_id', scrimId)
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  return { rows: data ?? [], error };
}

export async function getScrimTeams(db: AdminDb, tenantId: string, id: string) {
  const { data } = await db
    .from('scrims')
    .select('id, name, team1_id, team2_id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data ?? null;
}

export async function insertMatches(
  db: AdminDb,
  rows: Array<TablesInsert<'matches'> & { tenant_id: string }>
) {
  const { data, error } = await db
    .from('matches')
    .insert(rows)
    .select(MATCH_ROW_COLUMNS);
  return { rows: data ?? null, error };
}

/* ---- Casters d'un scrim ---- */

export async function listScrimCastAssignments(
  db: AdminDb,
  tenantId: string,
  scrimId: string
) {
  const { data, error } = await db
    .from('cast_assignments')
    .select(SCRIM_CAST_ASSIGNMENT_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('scrim_id', scrimId)
    .order('briefing_at', { ascending: true });
  return { rows: data ?? [], error };
}

export async function getCastMember(db: AdminDb, tenantId: string, id: string) {
  const { data, error } = await db
    .from('cast_members')
    .select('id, is_active')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function scrimExists(db: AdminDb, tenantId: string, id: string) {
  const { data } = await db
    .from('scrims')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return Boolean(data);
}

export async function insertScrimCastAssignment(
  db: AdminDb,
  row: {
    tenant_id: string;
    scrim_id: string;
    cast_member_id: string;
    briefing_at: string;
  }
) {
  const { data, error } = await db
    .from('cast_assignments')
    .insert({
      ...row,
      // match_id volontairement NULL — la CHECK polymorphique
      // (chk_cast_assignments_entity_xor) impose match XOR scrim.
      match_id: null,
    })
    .select(SCRIM_CAST_ASSIGNMENT_COLUMNS)
    .single();
  return { row: data ?? null, error };
}

/* ---- Transfert d'une demande de scrim externe ---- */

export async function getScrimDemande(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { data, error } = await db
    .from('demandes')
    .select(FORWARD_DEMANDE_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('type', 'scrim')
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function getActiveTeam(db: AdminDb, tenantId: string, id: string) {
  const { data } = await db
    .from('teams')
    .select('id, name')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .maybeSingle();
  return data ?? null;
}

/** Une demande en attente du même contact vers la même équipe ? */
export async function findPendingScrimDemande(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  requesterEmail: string
) {
  const { data } = await db
    .from('demandes')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId)
    .eq('type', 'scrim')
    .eq('status', 'pending')
    .filter('payload->>requester_email', 'eq', requesterEmail)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function insertDemande(
  db: AdminDb,
  row: TablesInsert<'demandes'> & { tenant_id: string }
) {
  const { data, error } = await db
    .from('demandes')
    .insert(row)
    .select('id')
    .single();
  return { row: data ?? null, error };
}

export async function updateDemandeStaffNote(
  db: AdminDb,
  tenantId: string,
  id: string,
  staffNote: string
) {
  await db
    .from('demandes')
    .update({ staff_note: staffNote })
    .eq('id', id)
    .eq('tenant_id', tenantId);
}
