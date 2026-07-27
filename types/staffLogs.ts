import type { StaffRole } from './admin';

export type StaffLogAction =
  // --- Session / navigation ---
  | 'login'
  | 'logout'
  | 'view_admin_page'
  | 'view_player_data'
  | 'view_captain_data'
  // --- Tournois ---
  | 'create_tournament'
  | 'update_tournament'
  | 'delete_tournament'
  | 'tournament_update'
  | 'finalize_tournament'
  | 'unfinalize_tournament'
  | 'update_public_page'
  | 'update_tournament_template'
  | 'apply_template'
  | 'save_placements'
  // --- Phases / stages ---
  | 'create_stage'
  | 'update_stage'
  | 'delete_stage'
  | 'clone_stage'
  | 'reassign_stage'
  | 'auto_advance_stage'
  | 'create_swiss_round'
  | 'shift_round'
  | 'advance_teams'
  | 'auto_seed_bracket'
  | 'update_bracket'
  | 'update_seed'
  | 'update_group_assignments'
  | 'auto_distribute_groups'
  | 'generate_group_matches'
  // --- Matchs ---
  | 'create_match'
  | 'update_match'
  | 'delete_match'
  | 'update_scores'
  | 'batch_scores'
  | 'report_score'
  | 'map_veto'
  | 'bulk_schedule'
  | 'bulk_update'
  | 'bulk_seed'
  | 'bulk_undo'
  | 'bulk_remove'
  // --- Disputes / preuves ---
  | 'open_match_dispute'
  | 'resolve_match_dispute'
  | 'cancel_match_dispute'
  | 'attach_match_evidence'
  | 'attach_evidence'
  // --- Équipes / roster ---
  | 'manage_team'
  | 'create_team'
  | 'update_team'
  | 'delete_team'
  | 'register_team'
  | 'transfer_team'
  | 'transfer_captain'
  | 'assign_team_captain'
  | 'assign_captain'
  | 'reassign_captain'
  | 'transfer_player_team'
  | 'manage_substitute'
  | 'bulk_roster_update'
  | 'add_team_member'
  | 'remove_team_member'
  | 'update_team_member'
  | 'kick_member'
  | 'leave_team'
  | 'send_team_message'
  | 'update_player_battle_tag'
  | 'update_member_profile'
  | 'update_profile'
  // --- Invitations ---
  | 'invite_create'
  | 'invite_accept'
  | 'invite_reject'
  | 'invite_cancel'
  // --- Check-in ---
  | 'checkin'
  | 'checkin_manual_nudge'
  // --- Staff / RBAC ---
  | 'staff_batch_action'
  | 'update_staff_role'
  | 'delete_staff_account'
  | 'toggle_pole_admin'
  // --- Tenants / provisioning ---
  | 'create_tenant'
  | 'update_tenant'
  | 'deactivate_tenant'
  | 'grant_tenant_staff'
  | 'revoke_tenant_staff'
  | 'reject_tenant_request'
  | 'expire_tenant_request'
  | 'claim_guild_link'
  | 'reject_guild_link'
  | 'update_tenant_discord_config'
  // --- Cast (régie) ---
  | 'create_cast_assignment'
  | 'delete_cast_assignment'
  | 'create_cast_member'
  | 'update_cast_member'
  | 'delete_cast_member'
  // --- Pôles / membres ---
  | 'create_pole_member'
  | 'update_pole_member'
  | 'delete_pole_member'
  // --- Contenu éditorial ---
  | 'publish_news'
  | 'create_announcement'
  | 'update_announcement'
  | 'delete_announcement'
  | 'update_comment'
  | 'delete_comment'
  // --- Discord / webhooks / bot ---
  | 'update_discord_webhook'
  | 'delete_discord_webhook'
  | 'create_webhook'
  | 'delete_webhook'
  | 'rotate_bot_secrets'
  // --- Support / demandes ---
  | 'update_support_ticket'
  | 'ticket_closed'
  | 'process_demande'
  | 'requestMoreInfo'
  | 'resend_credentials'
  // --- Blacklist ---
  | 'blacklist_add'
  | 'blacklist_update'
  | 'blacklist_remove'
  | 'entity_blacklist_add'
  | 'entity_blacklist_update'
  | 'entity_blacklist_remove'
  | 'support_ticket_convert_blacklist'
  // --- Broadcast ---
  | 'broadcast_state_update'
  | 'broadcast_next_match'
  // --- Run of show (event runs / segments / cues) ---
  | 'create_event_run'
  | 'update_event_run'
  | 'delete_event_run'
  | 'start_event_run'
  | 'end_event_run'
  | 'create_event_segment'
  | 'update_event_segment'
  | 'delete_event_segment'
  | 'start_event_segment'
  | 'end_event_segment'
  | 'skip_event_segment'
  | 'reorder_event_segments'
  | 'prefill_event_segments_from_tournament'
  | 'create_event_cue'
  | 'retract_event_cue'
  // --- Waves / stations ---
  | 'create_event_wave'
  | 'update_event_wave'
  | 'delete_event_wave'
  | 'reorder_event_waves'
  | 'create_event_station'
  | 'update_event_station'
  | 'delete_event_station'
  // --- Lobbies ---
  | 'create_lobby'
  | 'delete_lobby'
  // --- Map pool ---
  | 'create_map_pool_entry'
  | 'update_map_pool_entry'
  | 'delete_map_pool_entry'
  | 'import_default_maps'
  // --- Twitch ---
  | 'connect_twitch_broadcaster'
  | 'disconnect_twitch_broadcaster'
  | 'create_twitch_channel'
  | 'update_twitch_channel'
  | 'delete_twitch_channel'
  | 'create_twitch_prediction'
  | 'update_twitch_prediction'
  | 'create_twitch_reward'
  | 'update_twitch_reward'
  | 'delete_twitch_reward'
  | 'update_twitch_redemptions'
  | 'create_twitch_marker'
  | 'create_twitch_clip'
  | 'send_twitch_chat'
  | 'twitch_ban'
  | 'twitch_clear_chat'
  | 'twitch_chat_settings'
  // --- Prize pool / paiements ---
  | 'create_prize_pool'
  | 'update_prize_pool'
  | 'helloasso_sync'
  | 'generate_plan_checkout'
  // --- API tokens ---
  | 'create_api_token'
  | 'revoke_api_token'
  | 'update_api_token_comp'
  // --- MVP ---
  | 'import_mvp'
  // --- Partenaires / paramètres ---
  | 'settings_update'
  // --- Kanban interne (task board) ---
  | 'task_board_create'
  | 'task_board_update'
  | 'task_board_delete'
  | 'task_column_create'
  | 'task_column_update'
  | 'task_column_delete'
  | 'task_create'
  | 'task_update'
  | 'task_delete'
  | 'task_restore'
  | 'task_move'
  | 'task_assign'
  | 'task_comment_create'
  | 'task_comment_delete'
  | 'task_label_create'
  | 'task_label_update'
  | 'task_label_delete'
  // --- Verbes génériques (endpoints à statut / actions polyvalentes) ---
  | 'create'
  | 'update'
  | 'delete'
  | 'add'
  | 'remove'
  | 'assign'
  | 'activate'
  | 'deactivate'
  | 'accept'
  | 'reject'
  | 'approve'
  | 'ban'
  | 'claim'
  | 'cancel'
  | 'undo'
  | 'updateStatus'
  | 'other';

export type StaffLog = {
  id: string;
  created_at: string;
  staff_id: string;
  action: StaffLogAction;
  entity_type: string | null;
  entity_id: string | null;
  tournament_id: string | null;
  payload: Record<string, any> | null;
  staff: {
    id: string;
    auth_user_id: string;
    role: StaffRole;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

export type StaffLogInsert = {
  staff_id: string;
  action: StaffLogAction;
  entity_type?: string | null;
  entity_id?: string | null;
  tournament_id?: string | null;
  payload?: Record<string, any> | null;
  /**
   * Tenant courant : si absent, le helper `logStaffAction` retombe sur
   * DEFAULT_TENANT_ID. S7 rendra ce champ obligatoire une fois le switcher
   * tenant deploye et tous les call sites adaptes.
   */
  tenant_id?: string | null;
};

export type StaffLogsFilters = {
  staff_id?: string | null;
  action?: StaffLogAction | null;
  tournament_id?: string | null;
  entity_type?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  search?: string | null;
  /**
   * Tenant scope pour la lecture. Si fourni, restreint a ce tenant. Sinon
   * pas de filtre (S5b : seul DEFAULT_TENANT_ID en prod de toute facon).
   */
  tenant_id?: string | null;
};
