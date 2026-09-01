// lib/staffLogs.ts
// Gestion centralisée des logs staff (inserts + lecture + filtres)
import { supabaseAdmin } from './supabase';
import { DEFAULT_TENANT_ID } from './tenant';
import { logger } from './logger';
import type {
  StaffLog,
  StaffLogInsert,
  StaffLogsFilters,
} from '@/types/staffLogs';

export type {
  StaffLogAction,
  StaffLog,
  StaffLogInsert,
  StaffLogsFilters,
} from '@/types/staffLogs';

/* -----------------------------------------------------------
 * Insert log (utilisé dans staff.ts)
 * ---------------------------------------------------------*/

export async function logStaffAction(params: StaffLogInsert) {
  const {
    staff_id,
    action,
    entity_type = null,
    entity_id = null,
    tournament_id = null,
    payload = null,
    tenant_id = null,
    permission = null,
  } = params;

  // La permission rejoint le payload : elle décrit le DROIT invoqué, pas
  // l'objet touché, et n'a donc pas sa place dans une colonne dédiée tant que
  // seules quelques routes la renseignent.
  const finalPayload = permission
    ? { ...(payload ?? {}), permission }
    : payload;

  const { error } = await supabaseAdmin.from('staff_logs').insert({
    staff_id,
    action,
    entity_type,
    entity_id,
    tournament_id,
    payload: finalPayload,
    // TODO(S7): rendre obligatoire une fois le switcher tenant deploye et
    // tous les call sites adaptes. Pour l'instant on default a
    // DEFAULT_TENANT_ID — toujours mono-tenant en prod, defense-in-depth.
    tenant_id: tenant_id ?? DEFAULT_TENANT_ID,
  });

  if (error) {
    logger.error('logStaffAction error:', error, params);
  }
}

/* -----------------------------------------------------------
 * Lecture simple : derniers logs (limité)
 * ---------------------------------------------------------*/

export async function fetchStaffLogs(limit = 100): Promise<StaffLog[]> {
  const { data, error } = await supabaseAdmin
    .from('staff_logs')
    .select(
      `
      *,
      staff:staff!fk_staff_logs_staff(
        id,
        auth_user_id,
        role,
        display_name,
        avatar_url
      )
    `
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('fetchStaffLogs error:', error);
    return [];
  }

  return data as StaffLog[];
}

/* -----------------------------------------------------------
 * Version filtrable : pour /admin/logs
 * ---------------------------------------------------------*/

export async function fetchStaffLogsFiltered(
  filters: StaffLogsFilters,
  limit = 200
): Promise<StaffLog[]> {
  let query = supabaseAdmin
    .from('staff_logs')
    .select(
      `
      *,
      staff:staff!fk_staff_logs_staff(
        id,
        auth_user_id,
        role,
        display_name,
        avatar_url
      )
      `
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (filters.staff_id) {
    query = query.eq('staff_id', filters.staff_id);
  }

  if (filters.action) {
    query = query.eq('action', filters.action);
  }

  if (filters.tournament_id) {
    query = query.eq('tournament_id', filters.tournament_id);
  }

  if (filters.tenant_id) {
    query = query.eq('tenant_id', filters.tenant_id);
  }

  if (filters.entity_type) {
    query = query.eq('entity_type', filters.entity_type);
  }

  if (filters.date_from) {
    query = query.gte('created_at', filters.date_from);
  }

  if (filters.date_to) {
    query = query.lte('created_at', filters.date_to);
  }

  if (filters.search) {
    // Recherche textuelle dans payload (JSON)
    query = query.textSearch('payload', filters.search, {
      type: 'plain',
    });
  }

  const { data, error } = await query;

  if (error) {
    logger.error('fetchStaffLogsFiltered error:', error);
    return [];
  }

  return data as StaffLog[];
}

/* -----------------------------------------------------------
 * Helpers de PRÉSENTATION (libellés, format, options de filtre)
 *
 * Déplacés dans `utils/staffLogLabels.ts` : ce module-ci importe
 * `supabaseAdmin` (service-role), donc tout composant CLIENT qui venait y
 * chercher un simple libellé embarquait le client Node de supabase-js et ses
 * polyfills (~490 ko sur `/admin/logs`). Les ré-exports ci-dessous gardent
 * l'API historique pour les handlers serveur et les tests.
 * ---------------------------------------------------------*/

export {
  STAFF_LOG_ACTION_LABELS,
  STAFF_LOG_ACTION_OPTIONS,
  formatStaffLog,
} from './staffLogLabels';
