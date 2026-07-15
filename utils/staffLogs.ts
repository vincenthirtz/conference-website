// lib/staffLogs.ts
// Gestion centralisée des logs staff (inserts + lecture + filtres)
import { supabaseAdmin } from './supabase';
import { DEFAULT_TENANT_ID } from './tenant';
import { logger } from './logger';
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
    tenant_id = null,
  } = params;

  const { error } = await supabaseAdmin.from('staff_logs').insert({
    staff_id,
    action,
    entity_type,
    entity_id,
    tournament_id,
    payload,
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
    update_discord_webhook: 'Webhook Discord modifié',
    delete_discord_webhook: 'Webhook Discord supprimé',
    update_support_ticket: 'Ticket support modifié',
    import_mvp: 'MVP importé',
    open_match_dispute: 'Ouverture dispute match',
    resolve_match_dispute: 'Résolution dispute match',
    cancel_match_dispute: 'Annulation dispute match',
    attach_match_evidence: 'Preuve de match ajoutée',
    auto_advance_stage: 'Avancement automatique phase',
    generate_group_matches: 'Génération matchs de poule',
    create_cast_assignment: 'Assignment caster créé',
    delete_cast_assignment: 'Assignment caster supprimé',
    update_staff_role: 'Modification rôle staff',
    delete_staff_account: 'Suppression compte staff',
    finalize_tournament: 'Clôture tournoi (podium gelé)',
    unfinalize_tournament: 'Déverrouillage tournoi',
    checkin_manual_nudge: 'Relance check-in (Discord)',
    broadcast_state_update: 'Mise à jour état broadcast',
    blacklist_add: 'Ajout blacklist joueur',
    blacklist_update: 'Modification blacklist joueur',
    blacklist_remove: 'Suppression blacklist joueur',
    view_player_data: "a consulté l'espace joueur d'un utilisateur",
    view_captain_data: "a consulté l'espace capitaine d'un utilisateur",
    update_player_battle_tag: 'BattleTag joueur modifié',
    transfer_player_team: "Transfert d'équipe d'un joueur",
    assign_team_captain: 'Capitaine désigné',
    manage_substitute: 'Gestion remplaçant',
    process_demande: 'Traitement demande',
    bulk_roster_update: 'Mise à jour roster en masse',
    ticket_closed: 'Ticket fermé',
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
