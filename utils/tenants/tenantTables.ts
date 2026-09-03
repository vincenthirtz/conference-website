// utils/tenants/tenantTables.ts
//
// TOUTES les tables qui portent un `tenant_id`.
//
// 96 tables. Exporter ou purger un espace en recopiant une liste dans un
// handler, c'était garantir qu'à la 97ᵉ, l'export soit incomplet et la purge
// laisse des lignes derrière elle — sans que rien ne le signale : une table
// oubliée ne lève pas d'erreur.
//
// Régénérer après une migration qui ajoute une table `tenant_id` :
//
//   select string_agg(quote_literal(table_name), ', ' order by table_name)
//   from information_schema.columns c
//   where c.table_schema = 'public' and c.column_name = 'tenant_id'
//     and exists (select 1 from information_schema.tables t
//                 where t.table_schema = 'public' and t.table_name = c.table_name
//                   and t.table_type = 'BASE TABLE');
//
// `export: false` = purgée mais JAMAIS exportée. Deux familles : les secrets
// (clés d'API, jetons, identifiants d'intégration — les rendre dans une archive
// remise à un client qui part serait une fuite avec accusé de réception), et
// les caches techniques (idempotence, verrous) qui ne décrivent rien.

export type TenantTable = {
  table: string;
  /** Défaut : true. Voir l'en-tête pour les exceptions. */
  export?: boolean;
};

export const TENANT_TABLES: readonly TenantTable[] = [
  { table: 'admin_idempotency', export: false },
  { table: 'announcements' },
  { table: 'api_usage_counters' },
  { table: 'blacklist_alerts' },
  { table: 'bot_event_outbox' },
  { table: 'bot_idempotency', export: false },
  { table: 'bot_locks', export: false },
  { table: 'bot_player_actions' },
  { table: 'bracket_snapshots' },
  { table: 'cast_assignments' },
  { table: 'cast_members' },
  { table: 'caster_presence' },
  { table: 'custom_game_presets' },
  { table: 'demandes' },
  { table: 'discord_guild_presence' },
  { table: 'discord_guilds' },
  { table: 'discord_webhooks' },
  { table: 'email_deliveries' },
  { table: 'entity_blacklist' },
  { table: 'event_cue_acks' },
  { table: 'event_cues' },
  { table: 'event_runs' },
  { table: 'event_segments' },
  { table: 'event_stations' },
  { table: 'event_waves' },
  { table: 'final_rankings' },
  { table: 'free_players' },
  { table: 'games' },
  { table: 'integration_secrets', export: false },
  { table: 'league_scrims' },
  { table: 'league_standings' },
  { table: 'league_tournaments' },
  { table: 'leagues' },
  { table: 'lobbies' },
  { table: 'lobby_placements' },
  { table: 'match_drafts' },
  { table: 'match_evidence' },
  { table: 'match_lineups' },
  { table: 'match_map_vetos' },
  { table: 'match_mvp_polls' },
  { table: 'match_participants' },
  { table: 'match_score_reports' },
  { table: 'matches' },
  { table: 'news' },
  { table: 'news_comments' },
  { table: 'newsletter_subscribers' },
  { table: 'player_action_snoozes' },
  { table: 'player_blacklist' },
  { table: 'player_calendar_tokens', export: false },
  { table: 'player_rating_history' },
  { table: 'player_ratings' },
  { table: 'prize_pool_checkouts' },
  { table: 'prize_pool_contributions' },
  { table: 'push_subscriptions' },
  { table: 'scrim_planning_availabilities' },
  { table: 'scrim_plannings' },
  { table: 'scrim_score_reports' },
  { table: 'scrim_searches' },
  { table: 'scrims' },
  { table: 'site_settings' },
  { table: 'social_accounts' },
  { table: 'social_posts' },
  { table: 'staff_logs' },
  { table: 'stage_teams' },
  { table: 'stage_tiebreaker_overrides' },
  { table: 'support_tickets' },
  { table: 'task_boards' },
  { table: 'task_checklist_items' },
  { table: 'task_columns' },
  { table: 'task_comments' },
  { table: 'task_labels' },
  { table: 'tasks' },
  { table: 'team_audit_logs' },
  { table: 'team_availability' },
  { table: 'team_discord_channels' },
  { table: 'team_invite_links' },
  { table: 'team_member_permissions' },
  { table: 'team_members' },
  { table: 'team_ratings' },
  { table: 'team_reviews' },
  { table: 'teams' },
  { table: 'tenant_api_tokens', export: false },
  { table: 'tenant_invitations', export: false },
  { table: 'tenant_map_pool' },
  { table: 'tenant_plan_checkouts' },
  { table: 'tenant_plan_payments' },
  { table: 'tenant_secrets', export: false },
  { table: 'tenant_staff' },
  { table: 'tournament_maps' },
  { table: 'tournament_prize_pools' },
  { table: 'tournament_stages' },
  { table: 'tournament_teams' },
  { table: 'tournaments' },
  { table: 'twitch_broadcaster_connections', export: false },
  { table: 'twitch_channels' },
  { table: 'webhook_deliveries' },
  { table: 'webhook_subscriptions' },
];

/** Les tables qu'une archive remise au client doit contenir. */
export const EXPORTABLE_TABLES = TENANT_TABLES.filter(
  (t) => t.export !== false
).map((t) => t.table);

/** Tout ce qui doit disparaître à la purge, secrets et caches compris. */
export const PURGEABLE_TABLES = TENANT_TABLES.map((t) => t.table);
