// utils/staffLogLabels.ts
//
// Libellés + helpers de PRÉSENTATION des logs staff. Module volontairement
// SANS dépendance serveur : `utils/staffLogs.ts` importe `supabaseAdmin`
// (client service-role), et le panneau `components/admin/logs/StaffLogsPanel`
// n'avait besoin QUE des libellés — l'import traînait tout le client Node
// (crypto-browserify / stream-browserify / buffer / vm-browserify) dans le
// bundle de `/admin/logs`, soit ~490 ko de polyfills pour une seule page.
// Même convention que `STAFF_ROLES_CLIENT` dans `hooks/useStaffSession.ts`.
//
// Côté serveur, rien ne change : `utils/staffLogs.ts` ré-exporte ces trois
// symboles, donc tous les handlers d'API et les tests existants continuent de
// les importer depuis là.

import type { StaffLog, StaffLogAction } from '@/types/staffLogs';

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
  act_as_player: "a agi à la place d'un utilisateur dans son espace (écriture)",
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
  team_discord_writeback: 'Provisioning Discord d’équipe (bot)',
  event_run_manage: 'Régie — run of show',
  event_segment_manage: 'Régie — segment',
  event_station_manage: 'Régie — station',
  event_wave_manage: 'Régie — vague',
  event_cue_manage: 'Régie — top (cue)',
  delete_team: 'Suppression équipe',
  register_team: 'Inscription équipe',
  transfer_team: "Transfert d'équipe",
  transfer_captain: 'Transfert de capitanat',
  assign_team_captain: 'Capitaine désigné',
  assign_captain: 'Capitaine désigné',
  reassign_captain: 'Réassignation de capitaine',
  transfer_player_team: "Transfert d'équipe d'un joueur",
  manage_substitute: 'Gestion remplaçant',
  validate_match_lineup: 'Feuille de match validée (à la place de l’équipe)',
  reopen_match_lineup: 'Feuille de match rouverte',
  bulk_roster_update: 'Mise à jour roster en masse',
  add_team_member: "Ajout d'un membre d'équipe",
  remove_team_member: "Retrait d'un membre d'équipe",
  update_team_member: "Modification d'un membre d'équipe",
  kick_member: "Exclusion d'un membre",
  leave_team: "Départ d'une équipe",
  send_team_message: "Message envoyé aux salons d'équipe",
  team_availability_add: 'Contrainte de disponibilité ajoutée',
  team_availability_update: 'Contrainte de disponibilité modifiée',
  team_availability_delete: 'Contrainte de disponibilité supprimée',
  update_player_battle_tag: 'BattleTag joueur modifié',
  update_player_skill_rating: 'Niveau Overwatch modifié',
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
  create_user: 'Création de compte',
  update_staff_role: 'Modification rôle staff',
  delete_staff_account: 'Suppression compte staff',
  suspend_user: 'Suspension de compte',
  unsuspend_user: 'Levée de suspension',
  toggle_pole_admin: 'Bascule admin de pôle',
  // Tenants / provisioning
  create_tenant: 'Création tenant',
  update_tenant: 'Modification tenant',
  deactivate_tenant: 'Désactivation tenant',
  tenant_lifecycle: "Changement d'état d'un espace",
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
  // Joueuses libres
  delete_free_player: 'Retrait fiche joueuse libre',
  // Contenu éditorial
  publish_news: 'Publication actualité',
  publish_social_post: 'Publication post multi-réseaux',
  connect_social_account: 'Connexion compte réseau social',
  store_social_credentials: 'Secret d’app réseau social enregistré',
  create_announcement: 'Création annonce',
  update_announcement: 'Modification annonce',
  delete_announcement: 'Suppression annonce',
  update_comment: 'Modification commentaire',
  delete_comment: 'Suppression commentaire',
  // Discord / webhooks / bot
  update_discord_webhook: 'Webhook Discord modifié',
  delete_discord_webhook: 'Webhook Discord supprimé',
  discord_refresh: 'État Discord rafraîchi',
  discord_provision: 'Salons d’équipe provisionnés',
  discord_repair: 'Permissions des salons d’équipe réparées',
  discord_delete_channel: 'Salon d’équipe supprimé',
  discord_delete_role: 'Rôle d’équipe supprimé',
  discord_grant_access: 'Accès à un salon d’équipe accordé',
  discord_revoke_access: 'Accès à un salon d’équipe retiré',
  discord_grant_role: 'Rôle d’équipe attribué',
  discord_revoke_role: 'Rôle d’équipe retiré',
  create_webhook: 'Création webhook',
  delete_webhook: 'Suppression webhook',
  rotate_bot_secrets: 'Rotation des secrets bot',
  // Support / demandes
  update_support_ticket: 'Ticket support modifié',
  ticket_closed: 'Ticket fermé',
  process_demande: 'Traitement demande',
  notify_scrim_captains: 'Relance capitaines (scrim)',
  requestMoreInfo: "Demande d'informations complémentaires",
  resend_credentials: 'Renvoi des identifiants',
  // Blacklist
  blacklist_add: 'Ajout blacklist joueur',
  blacklist_update: 'Modification blacklist joueur',
  blacklist_remove: 'Suppression blacklist joueur',
  entity_blacklist_add: 'Ajout blacklist entité',
  entity_blacklist_update: 'Modification blacklist entité',
  entity_blacklist_remove: 'Suppression blacklist entité',
  support_ticket_convert_blacklist: 'Conversion signalement → blacklist',
  // Broadcast
  broadcast_state_update: 'Mise à jour état broadcast',
  broadcast_next_match: 'Passage au match suivant (broadcast)',
  // Cockpit caster web (/admin/caster)
  caster_match_import: 'Import d’un match dans une scène caster',
  caster_stream_toggle: 'Démarrage / arrêt du stream OBS',
  caster_record_toggle: 'Démarrage / arrêt de l’enregistrement OBS',
  caster_obs_setup_scenes: 'Configuration des scènes OBS (overlays)',
  caster_poll_toggle: 'Ouverture / fermeture du vote MVP',
  caster_theme_activate: 'Activation d’un thème d’overlay',
  caster_scene_create: 'Création d’une scène caster',
  caster_scene_delete: 'Suppression d’une scène caster',
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
  // Presets de partie personnalisée
  create_custom_game_preset: 'Création preset partie perso',
  update_custom_game_preset: 'Modification preset partie perso',
  delete_custom_game_preset: 'Suppression preset partie perso',
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
  read_association_documents: 'Consultation des documents de l’asso',
  upload_association_document: 'Dépôt d’un document de l’asso',
  trash_association_document: 'Document de l’asso mis à la corbeille',
  download_association_document: 'Téléchargement d’un document de l’asso',
  store_drive_credentials: 'Clé du compte de service Drive enregistrée',
  update_staff_permissions: 'Permissions accordées à un membre du staff',
  // Kanban interne (task board)
  task_board_create: 'Création tableau Kanban',
  task_board_update: 'Modification tableau Kanban',
  task_board_delete: 'Suppression tableau Kanban',
  task_column_create: 'Création colonne Kanban',
  task_column_update: 'Modification colonne Kanban',
  task_column_delete: 'Suppression colonne Kanban',
  task_create: 'Création tâche',
  task_update: 'Modification tâche',
  task_delete: 'Suppression tâche',
  task_restore: 'Restauration tâche',
  task_move: 'Déplacement tâche',
  task_assign: 'Assignation tâche',
  task_comment_create: 'Commentaire de tâche ajouté',
  task_comment_delete: 'Commentaire de tâche supprimé',
  task_label_create: 'Création label Kanban',
  task_label_update: 'Modification label Kanban',
  task_label_delete: 'Suppression label Kanban',
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
