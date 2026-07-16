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

/**
 * Libellé FR lisible pour CHAQUE slug de `StaffLogAction`.
 * Aucun slug ne doit rester sans label — la clé est typée `Record<StaffLogAction,…>`
 * donc TypeScript casse la compilation si un slug est ajouté à l'union sans libellé.
 */
export const STAFF_LOG_ACTION_LABELS: Record<StaffLogAction, string> = {
  // Session / navigation
  login: 'Connexion',
  logout: 'Déconnexion',
  view_admin_page: 'Vue page admin',
  view_player_data: "a consulté l'espace joueur d'un utilisateur",
  view_captain_data: "a consulté l'espace capitaine d'un utilisateur",
  // Tournois
  create_tournament: 'Création tournoi',
  update_tournament: 'Modification tournoi',
  delete_tournament: 'Suppression tournoi',
  tournament_update: 'Mise à jour tournoi',
  finalize_tournament: 'Clôture tournoi (podium gelé)',
  unfinalize_tournament: 'Déverrouillage tournoi',
  update_public_page: 'Modification page publique',
  update_tournament_template: 'Modification template de tournoi',
  apply_template: 'Application template',
  save_placements: 'Enregistrement des placements',
  // Phases / stages
  create_stage: 'Création phase',
  update_stage: 'Modification phase',
  delete_stage: 'Suppression phase',
  clone_stage: 'Clonage phase',
  reassign_stage: 'Réassignation de phase',
  auto_advance_stage: 'Avancement automatique phase',
  create_swiss_round: 'Création round swiss',
  shift_round: 'Décalage de round',
  advance_teams: 'Avancement équipes',
  auto_seed_bracket: 'Seeding automatique bracket',
  update_bracket: 'Mise à jour bracket',
  update_seed: 'Modification seed',
  update_group_assignments: 'Mise à jour groupes',
  auto_distribute_groups: 'Distribution auto groupes',
  generate_group_matches: 'Génération matchs de poule',
  // Matchs
  create_match: 'Création match',
  update_match: 'Modification match',
  delete_match: 'Suppression match',
  update_scores: 'Mise à jour scores',
  batch_scores: 'Scores en masse',
  report_score: 'Report de score',
  map_veto: 'Veto de maps',
  bulk_schedule: 'Planification en masse',
  bulk_update: 'Modification en masse',
  bulk_seed: 'Seeding en masse',
  bulk_undo: 'Annulation en masse',
  bulk_remove: 'Suppression en masse',
  // Disputes / preuves
  open_match_dispute: 'Ouverture dispute match',
  resolve_match_dispute: 'Résolution dispute match',
  cancel_match_dispute: 'Annulation dispute match',
  attach_match_evidence: 'Preuve de match ajoutée',
  attach_evidence: 'Preuve ajoutée',
  // Équipes / roster
  manage_team: 'Action équipe',
  create_team: 'Création équipe',
  update_team: 'Modification équipe',
  delete_team: 'Suppression équipe',
  register_team: 'Inscription équipe',
  transfer_team: "Transfert d'équipe",
  transfer_captain: 'Transfert de capitanat',
  assign_team_captain: 'Capitaine désigné',
  assign_captain: 'Capitaine désigné',
  reassign_captain: 'Réassignation de capitaine',
  transfer_player_team: "Transfert d'équipe d'un joueur",
  manage_substitute: 'Gestion remplaçant',
  bulk_roster_update: 'Mise à jour roster en masse',
  add_team_member: "Ajout d'un membre d'équipe",
  remove_team_member: "Retrait d'un membre d'équipe",
  update_team_member: "Modification d'un membre d'équipe",
  kick_member: "Exclusion d'un membre",
  leave_team: "Départ d'une équipe",
  update_player_battle_tag: 'BattleTag joueur modifié',
  update_member_profile: 'Modification profil membre',
  update_profile: 'Modification profil',
  // Invitations
  invite_create: "Création d'invitation",
  invite_accept: "Acceptation d'invitation",
  invite_reject: "Refus d'invitation",
  invite_cancel: "Annulation d'invitation",
  // Check-in
  checkin: 'Check-in',
  checkin_manual_nudge: 'Relance check-in (Discord)',
  // Staff / RBAC
  staff_batch_action: 'Action batch staff',
  update_staff_role: 'Modification rôle staff',
  delete_staff_account: 'Suppression compte staff',
  toggle_pole_admin: 'Bascule admin de pôle',
  // Tenants / provisioning
  create_tenant: 'Création tenant',
  update_tenant: 'Modification tenant',
  deactivate_tenant: 'Désactivation tenant',
  grant_tenant_staff: 'Ajout staff au tenant',
  revoke_tenant_staff: 'Retrait staff du tenant',
  reject_tenant_request: 'Refus demande de tenant',
  expire_tenant_request: 'Expiration demande de tenant',
  claim_guild_link: 'Association guilde Discord',
  reject_guild_link: 'Refus association guilde',
  update_tenant_discord_config: 'Config Discord du tenant modifiée',
  // Cast (régie)
  create_cast_assignment: 'Assignment caster créé',
  delete_cast_assignment: 'Assignment caster supprimé',
  create_cast_member: 'Création membre régie',
  update_cast_member: 'Modification membre régie',
  delete_cast_member: 'Suppression membre régie',
  // Pôles / membres
  create_pole_member: 'Création membre de pôle',
  update_pole_member: 'Modification membre de pôle',
  delete_pole_member: 'Suppression membre de pôle',
  // Contenu éditorial
  publish_news: 'Publication actualité',
  create_announcement: 'Création annonce',
  update_announcement: 'Modification annonce',
  delete_announcement: 'Suppression annonce',
  update_comment: 'Modification commentaire',
  delete_comment: 'Suppression commentaire',
  // Discord / webhooks / bot
  update_discord_webhook: 'Webhook Discord modifié',
  delete_discord_webhook: 'Webhook Discord supprimé',
  create_webhook: 'Création webhook',
  delete_webhook: 'Suppression webhook',
  rotate_bot_secrets: 'Rotation des secrets bot',
  // Support / demandes
  update_support_ticket: 'Ticket support modifié',
  ticket_closed: 'Ticket fermé',
  process_demande: 'Traitement demande',
  requestMoreInfo: "Demande d'informations complémentaires",
  resend_credentials: 'Renvoi des identifiants',
  // Blacklist
  blacklist_add: 'Ajout blacklist joueur',
  blacklist_update: 'Modification blacklist joueur',
  blacklist_remove: 'Suppression blacklist joueur',
  // Broadcast
  broadcast_state_update: 'Mise à jour état broadcast',
  broadcast_next_match: 'Passage au match suivant (broadcast)',
  // Run of show
  create_event_run: 'Création run of show',
  update_event_run: 'Modification run of show',
  delete_event_run: 'Suppression run of show',
  start_event_run: 'Démarrage run of show',
  end_event_run: 'Fin run of show',
  create_event_segment: 'Création segment',
  update_event_segment: 'Modification segment',
  delete_event_segment: 'Suppression segment',
  start_event_segment: 'Démarrage segment',
  end_event_segment: 'Fin segment',
  skip_event_segment: 'Segment sauté',
  reorder_event_segments: 'Réordonnancement segments',
  prefill_event_segments_from_tournament:
    'Pré-remplissage segments depuis tournoi',
  create_event_cue: 'Création cue',
  retract_event_cue: 'Retrait cue',
  // Waves / stations
  create_event_wave: 'Création vague',
  update_event_wave: 'Modification vague',
  delete_event_wave: 'Suppression vague',
  reorder_event_waves: 'Réordonnancement vagues',
  create_event_station: 'Création station',
  update_event_station: 'Modification station',
  delete_event_station: 'Suppression station',
  // Lobbies
  create_lobby: 'Création lobby',
  delete_lobby: 'Suppression lobby',
  // Map pool
  create_map_pool_entry: 'Ajout map au pool',
  update_map_pool_entry: 'Modification map du pool',
  delete_map_pool_entry: 'Suppression map du pool',
  import_default_maps: 'Import maps par défaut',
  // Twitch
  connect_twitch_broadcaster: 'Connexion broadcaster Twitch',
  disconnect_twitch_broadcaster: 'Déconnexion broadcaster Twitch',
  create_twitch_channel: 'Ajout chaîne Twitch',
  update_twitch_channel: 'Modification chaîne Twitch',
  delete_twitch_channel: 'Suppression chaîne Twitch',
  create_twitch_prediction: 'Création prédiction Twitch',
  update_twitch_prediction: 'Mise à jour prédiction Twitch',
  create_twitch_reward: 'Création récompense Twitch',
  update_twitch_reward: 'Modification récompense Twitch',
  delete_twitch_reward: 'Suppression récompense Twitch',
  update_twitch_redemptions: 'Mise à jour rédemptions Twitch',
  create_twitch_marker: 'Création marqueur Twitch',
  create_twitch_clip: 'Création clip Twitch',
  send_twitch_chat: 'Message chat Twitch envoyé',
  twitch_ban: 'Bannissement Twitch',
  twitch_clear_chat: 'Chat Twitch effacé',
  twitch_chat_settings: 'Paramètres chat Twitch',
  // Prize pool / paiements
  create_prize_pool: 'Création cagnotte',
  update_prize_pool: 'Modification cagnotte',
  helloasso_sync: 'Synchronisation HelloAsso',
  generate_plan_checkout: 'Génération checkout abonnement',
  // API tokens
  create_api_token: 'Création token API',
  revoke_api_token: 'Révocation token API',
  update_api_token_comp: 'Modification token API',
  // MVP
  import_mvp: 'MVP importé',
  // Partenaires / paramètres
  settings_update: 'Mise à jour paramètres',
  // Verbes génériques
  create: 'Création',
  update: 'Modification',
  delete: 'Suppression',
  add: 'Ajout',
  remove: 'Retrait',
  assign: 'Assignation',
  activate: 'Activation',
  deactivate: 'Désactivation',
  accept: 'Acceptation',
  reject: 'Refus',
  approve: 'Approbation',
  ban: 'Bannissement',
  claim: 'Revendication',
  cancel: 'Annulation',
  undo: 'Annulation',
  updateStatus: 'Changement de statut',
  other: 'Action staff',
};

export function formatStaffLog(log: StaffLog) {
  const actionMap = STAFF_LOG_ACTION_LABELS;

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

/* -----------------------------------------------------------
 * Options runtime pour le dropdown UI (filtre action)
 * Dérivées de STAFF_LOG_ACTION_LABELS, triées par label (locale fr).
 * ---------------------------------------------------------*/

export const STAFF_LOG_ACTION_OPTIONS: {
  value: StaffLogAction;
  label: string;
}[] = (Object.entries(STAFF_LOG_ACTION_LABELS) as [StaffLogAction, string][])
  .map(([value, label]) => ({ value, label }))
  .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
