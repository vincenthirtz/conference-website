import type { StaffRole } from './admin';

export type StaffLogAction =
  | 'login'
  | 'logout'
  | 'view_admin_page'
  | 'create_tournament'
  | 'update_tournament'
  | 'delete_tournament'
  | 'create_stage'
  | 'update_stage'
  | 'delete_stage'
  | 'create_match'
  | 'update_match'
  | 'delete_match'
  | 'update_bracket'
  | 'update_scores'
  | 'staff_batch_action'
  | 'manage_team'
  | 'update_team'
  | 'delete_team'
  | 'tournament_update'
  | 'create_swiss_round'
  | 'advance_teams'
  | 'apply_template'
  | 'clone_stage'
  | 'auto_seed_bracket'
  | 'update_group_assignments'
  | 'auto_distribute_groups'
  | 'bulk_schedule'
  | 'bulk_update'
  | 'map_veto'
  | 'update_discord_webhook'
  | 'delete_discord_webhook'
  | 'update_support_ticket'
  | 'import_mvp'
  | 'open_match_dispute'
  | 'resolve_match_dispute'
  | 'cancel_match_dispute'
  | 'auto_advance_stage'
  | 'generate_group_matches'
  | 'create_cast_assignment'
  | 'delete_cast_assignment'
  | 'update_staff_role'
  | 'delete_staff_account'
  | 'finalize_tournament'
  | 'unfinalize_tournament'
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
