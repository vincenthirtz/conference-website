/* ---------------------------------------------------------------------------
 * index_hygiene.sql — couvrir les clés étrangères, retirer les index redondants
 *
 * DEUX GESTES OPPOSÉS, UNE SEULE INTENTION : que chaque index présent serve à
 * quelque chose, et qu'aucun index nécessaire ne manque.
 *
 * ============================================================================
 * 1) VINGT ET UNE CLÉS ÉTRANGÈRES SANS INDEX COUVRANT
 * ============================================================================
 *
 * CE N'EST PAS UNE QUESTION DE LENTEUR DE LECTURE — les tables concernées font
 * 40 à 128 ko, quelques dizaines de lignes : aucune requête n'en souffre
 * aujourd'hui, et prétendre le contraire serait inventer un gain.
 *
 * LE SERVICE RENDU EST AILLEURS, SUR LES SUPPRESSIONS. Quand une ligne PARENT
 * disparaît, Postgres doit vérifier chaque table enfant qui la référence. Sans
 * index sur la colonne portant la clé, c'est un parcours SÉQUENTIEL de la table
 * enfant, avec les verrous qui vont avec — une fois par ligne supprimée. Ce
 * dépôt a précisément des chemins de suppression : clôture de compte
 * (`/api/player/delete-account`), purge de tenant (`tenant-purge-cron`),
 * suppression d'équipe. Les colonnes d'audit (`created_by`, `updated_by`,
 * `validated_by`, `invited_by`…) sont exactement celles que ces chemins
 * traversent.
 *
 * C'est donc PRÉVENTIF, et c'est assumé comme tel : le coût est nul à cette
 * taille, la dette serait pénible à rattraper quand les tables auront grossi.
 *
 * ============================================================================
 * 2) TRENTE-NEUF INDEX REDONDANTS
 * ============================================================================
 *
 * REDONDANT A ICI UN SENS PRÉCIS : les colonnes de l'index sont un PRÉFIXE de
 * celles d'un autre index de la même table. Postgres sait se servir du plus
 * large pour les mêmes recherches ; le plus étroit ne lui apprend rien.
 *
 * CE N'EST PAS LA LISTE « JAMAIS UTILISÉS » DU LINTER, et la distinction est
 * le cœur de ce lot. Le linter en signale 94 ; beaucoup ne sont « inutilisés »
 * que parce que la fonctionnalité n'a pas encore tourné (les échanges TCG ont
 * zéro ligne, les marchés de joueuses démarrent à peine). Les supprimer sur ce
 * seul critère serait confondre « inutile » et « pas encore utilisé ». La
 * redondance STRUCTURELLE, elle, ne dépend d'aucune statistique d'usage : elle
 * se démontre sur la définition des index.
 *
 * Certains de ces index sont d'ailleurs très sollicités
 * (`support_tickets_tournament_idx`, 9 349 parcours) : le planificateur les
 * choisit parce qu'ils sont plus PETITS, pas parce qu'ils sont nécessaires. Il
 * se rabattra sur l'index large, pour le même résultat.
 *
 * LE GAIN EST MODESTE ET HONNÊTE : ~600 ko, et surtout une écriture de moins à
 * maintenir par index sur chaque INSERT/UPDATE des tables chaudes (`matches`,
 * `demandes`, `support_tickets`).
 *
 * POUR REVENIR EN ARRIÈRE : chaque index supprimé est recréable depuis sa
 * migration d'origine ; aucun ne porte de contrainte (ni UNIQUE, ni clé
 * primaire — le script qui les a listés les excluait).
 *
 * POUR REVÉRIFIER (les deux compteurs doivent valoir 0 ; ils ne passent pas par
 * PostgREST, qui n'expose pas `pg_catalog` — il faut un accès SQL) :
 *
 *   -- clés étrangères sans index couvrant
 *   SELECT count(*) FROM pg_constraint c
 *    WHERE c.contype='f' AND c.connamespace='public'::regnamespace
 *      AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=c.conrelid
 *        AND (i.indkey::smallint[])[0:array_length(c.conkey,1)-1]=c.conkey);
 *
 *   -- index dont les colonnes préfixent celles d'un autre
 *   WITH idx AS (SELECT i.indrelid::regclass::text tbl, c.relname nom,
 *     string_to_array(i.indkey::text,' ')::int[] cols, i.indisunique uniq,
 *     i.indisprimary pkey, i.indpred IS NOT NULL partiel
 *     FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
 *     JOIN pg_namespace n ON n.oid=c.relnamespace
 *     WHERE n.nspname='public' AND i.indisvalid)
 *   SELECT count(DISTINCT a.nom) FROM idx a JOIN idx b
 *     ON a.tbl=b.tbl AND a.nom<>b.nom
 *    AND b.cols[1:array_length(a.cols,1)]=a.cols
 *    AND array_length(b.cols,1)>=array_length(a.cols,1)
 *    WHERE a.uniq=false AND a.pkey=false AND a.partiel=false AND b.partiel=false;
 *
 * Passage du 2026-09-20 après application : 0 et 0, sur 610 index.
 *
 * IDEMPOTENT : `IF NOT EXISTS` / `IF EXISTS` partout.
 * ------------------------------------------------------------------------- */

BEGIN;

/* --- 1) Clés étrangères non couvertes ----------------------------------- */

CREATE INDEX IF NOT EXISTS idx_circuit_partner_applications_granted_tenant
  ON public.circuit_partner_applications (granted_tenant_id);
CREATE INDEX IF NOT EXISTS idx_games_picked_by_team
  ON public.games (picked_by_team_id);
CREATE INDEX IF NOT EXISTS idx_integration_secrets_updated_by
  ON public.integration_secrets (updated_by);
CREATE INDEX IF NOT EXISTS idx_match_lineups_tenant
  ON public.match_lineups (tenant_id);
CREATE INDEX IF NOT EXISTS idx_match_lineups_validated_by
  ON public.match_lineups (validated_by);
CREATE INDEX IF NOT EXISTS idx_match_predictions_match
  ON public.match_predictions (match_id);
CREATE INDEX IF NOT EXISTS idx_social_accounts_connected_by
  ON public.social_accounts (connected_by);
CREATE INDEX IF NOT EXISTS idx_social_posts_created_by
  ON public.social_posts (created_by);
CREATE INDEX IF NOT EXISTS idx_tcg_pack_cards_card_fanart
  ON public.tcg_pack_cards (card_fanart_id);
CREATE INDEX IF NOT EXISTS idx_tcg_packs_source_match
  ON public.tcg_packs (source_match_id);
CREATE INDEX IF NOT EXISTS idx_tcg_player_cards_photo_reviewed_by
  ON public.tcg_player_cards (photo_reviewed_by);
CREATE INDEX IF NOT EXISTS idx_tcg_trades_proposer_pack
  ON public.tcg_trades (proposer_pack_id);
CREATE INDEX IF NOT EXISTS idx_tcg_trades_recipient_pack
  ON public.tcg_trades (recipient_pack_id);
CREATE INDEX IF NOT EXISTS idx_team_availability_constraints_created_by
  ON public.team_availability_constraints (created_by);
CREATE INDEX IF NOT EXISTS idx_team_availability_constraints_team
  ON public.team_availability_constraints (team_id);
CREATE INDEX IF NOT EXISTS idx_team_availability_constraints_tournament
  ON public.team_availability_constraints (tournament_id);
CREATE INDEX IF NOT EXISTS idx_team_invite_links_created_by
  ON public.team_invite_links (created_by);
CREATE INDEX IF NOT EXISTS idx_team_invite_links_team
  ON public.team_invite_links (team_id);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_accepted_staff
  ON public.tenant_invitations (accepted_staff_id);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_invited_by
  ON public.tenant_invitations (invited_by);
CREATE INDEX IF NOT EXISTS idx_tenants_lifecycle_changed_by
  ON public.tenants (lifecycle_changed_by);

/* --- 2) Index dont les colonnes préfixent celles d'un autre -------------- */

DROP INDEX IF EXISTS public.cast_assignments_match_idx;
DROP INDEX IF EXISTS public.idx_adherent_payments_adherent;
DROP INDEX IF EXISTS public.idx_admin_idempotency_tenant_id;
DROP INDEX IF EXISTS public.idx_announcements_tenant_id;
DROP INDEX IF EXISTS public.idx_bot_idempotency_tenant_id;
DROP INDEX IF EXISTS public.idx_bot_locks_tenant_id;
DROP INDEX IF EXISTS public.idx_cast_members_tenant_id;
DROP INDEX IF EXISTS public.idx_custom_game_presets_tenant;
DROP INDEX IF EXISTS public.idx_demandes_tenant_id;
DROP INDEX IF EXISTS public.idx_final_rankings_tournament;
DROP INDEX IF EXISTS public.idx_free_players_tenant_id;
DROP INDEX IF EXISTS public.idx_lobby_placements_lobby;
DROP INDEX IF EXISTS public.idx_match_draft_steps_draft;
DROP INDEX IF EXISTS public.idx_match_drafts_match;
DROP INDEX IF EXISTS public.idx_match_map_vetos_match;
DROP INDEX IF EXISTS public.idx_match_participants_match;
DROP INDEX IF EXISTS public.idx_match_score_reports_match_id;
DROP INDEX IF EXISTS public.idx_news_tenant_id;
DROP INDEX IF EXISTS public.idx_notification_prefs_user_id;
DROP INDEX IF EXISTS public.idx_player_action_snoozes_tenant_id;
DROP INDEX IF EXISTS public.idx_scrim_planning_avail_planning;
DROP INDEX IF EXISTS public.idx_scrims_tenant_id;
DROP INDEX IF EXISTS public.idx_staff_logs_tenant_id;
DROP INDEX IF EXISTS public.idx_stage_teams_stage_id;
DROP INDEX IF EXISTS public.idx_stage_tiebreaker_overrides_stage;
DROP INDEX IF EXISTS public.idx_task_checklist_items_task_id;
DROP INDEX IF EXISTS public.idx_task_comments_task_id;
DROP INDEX IF EXISTS public.idx_task_labels_board_id;
DROP INDEX IF EXISTS public.idx_team_invite_links_token_hash;
DROP INDEX IF EXISTS public.idx_tenant_api_tokens_token_hash;
DROP INDEX IF EXISTS public.idx_tenant_map_pool_tenant_game;
DROP INDEX IF EXISTS public.idx_tournament_maps_tenant_id;
DROP INDEX IF EXISTS public.idx_tournament_maps_tournament;
DROP INDEX IF EXISTS public.idx_tournament_prize_pools_tournament;
DROP INDEX IF EXISTS public.idx_tournament_teams_tournament;
DROP INDEX IF EXISTS public.idx_tournaments_tenant_id;
DROP INDEX IF EXISTS public.idx_twitch_channels_tenant_id;
DROP INDEX IF EXISTS public.scrim_score_reports_scrim_idx;
DROP INDEX IF EXISTS public.support_tickets_tournament_idx;

COMMIT;

NOTIFY pgrst, 'reload schema';
