// lib/staffLogs.ts
// Gestion centralisée des logs staff (inserts + lecture + filtres)
import { supabaseAdmin } from './supabase';
import type {
  StaffLogAction,
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
  } = params;

  const { error } = await supabaseAdmin.from('staff_logs').insert({
    staff_id,
    action,
    entity_type,
    entity_id,
    tournament_id,
    payload,
  });

  if (error) {
    console.error('logStaffAction error:', error, params);
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
    console.error('fetchStaffLogs error:', error);
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
    console.error('fetchStaffLogsFiltered error:', error);
    return [];
  }

  return data as StaffLog[];
}

/* -----------------------------------------------------------
 * Helper format pour UI
 * ---------------------------------------------------------*/

export function formatStaffLog(log: StaffLog) {
  const actionMap: Record<StaffLogAction, string> = {
    login: 'Connexion',
    logout: 'Déconnexion',
    view_admin_page: 'Vue page admin',
    create_tournament: 'Création tournoi',
    update_tournament: 'Modification tournoi',
    delete_tournament: 'Suppression tournoi',
    create_stage: 'Création phase',
    update_stage: 'Modification phase',
    delete_stage: 'Suppression phase',
    create_match: 'Création match',
    update_match: 'Modification match',
    delete_match: 'Suppression match',
    update_bracket: 'Mise à jour bracket',
    update_scores: 'Mise à jour scores',
    staff_batch_action: 'Action batch staff',
    manage_team: 'Action équipe',
    update_team: 'Modification équipe',
    delete_team: 'Suppression équipe',
    tournament_update: 'Mise à jour tournoi',
    create_swiss_round: 'Création round swiss',
    advance_teams: 'Avancement équipes',
    apply_template: 'Application template',
    clone_stage: 'Clonage phase',
    auto_seed_bracket: 'Seeding automatique bracket',
    update_group_assignments: 'Mise à jour groupes',
    auto_distribute_groups: 'Distribution auto groupes',
    bulk_schedule: 'Planification en masse',
    bulk_update: 'Modification en masse',
    map_veto: 'Veto de maps',
    other: 'Action staff',
  };

  const readable = actionMap[log.action] || log.action;

  const entityLabel = log.entity_type
    ? `${log.entity_type}${log.entity_id ? ` #${log.entity_id}` : ''}`
    : null;

  return {
    ...log,
    readableAction: readable,
    readableEntity: entityLabel,
    date: new Date(log.created_at).toLocaleString('fr-FR'),
  };
}
