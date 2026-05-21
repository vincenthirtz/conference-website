-- Phase 3 / S6a — Contract step 1 : SET NOT NULL + FK tenants(id) sur les 30 tables scoped
--
-- POURQUOI :
--   Phase 1 (a/b/c) a posé tenant_id nullable + index + backfill sur 30 tables.
--   Phase 2 (S5) a mis à jour 100 % du code applicatif pour écrire tenant_id
--   explicitement à chaque INSERT. Le sweep S3 a confirmé 0 row NULL en prod.
--
--   On verrouille maintenant le schéma : NOT NULL + FK vers tenants(id)
--   ON DELETE RESTRICT pour empêcher la suppression d'un tenant tant qu'il
--   reste des données rattachées (pas de cascade silencieuse — un opérateur
--   qui supprime un tenant doit explicitement vider les tables d'abord).
--
-- STRATÉGIE LOCK-LIGHT :
--   - Re-backfill safety net en début (no-op attendu d'après le sweep, mais
--     on protège contre une row écrite entre le dernier sweep et l'apply).
--   - ALTER COLUMN SET NOT NULL prend un ACCESS EXCLUSIVE LOCK le temps du
--     full scan. Sur les tables actuelles (≤ quelques milliers de rows),
--     c'est négligeable. Pour les futures grosses tables, voir CAVEAT.
--   - FK ajoutée NOT VALID (pas de scan immédiat), puis VALIDATE CONSTRAINT
--     séparément (lock plus léger : SHARE UPDATE EXCLUSIVE).
--
-- TABLES NON TOUCHÉES (déjà NOT NULL + FK depuis la création) :
--   - discord_guilds        (FK ON DELETE RESTRICT)
--   - tenant_staff          (FK ON DELETE CASCADE — voulu : on perd les
--                            rattachements staff si le tenant disparaît)
--
-- POSTGREST :
--   La modification de FK impacte les embeds PostgREST. NOTIFY pgrst en fin.
--   Vérifier ensuite côté Supabase Studio → Settings → API → Reload schema.
--
-- CAVEAT :
--   - Idempotent : guards DO ... IF NOT EXISTS pour FK et IS_NULLABLE check
--     pour SET NOT NULL.
--   - ON DELETE RESTRICT volontaire — si on veut un jour CASCADE pour usage
--     interne, le faire dans une migration dédiée et après revue.
--   - Aucune modification de PK / UNIQUE composites ici (voir migration
--     enforce_tenant_id_composite_constraints.sql qui suit).
--   - Tenant UUID conference : ce69a726-773e-4d12-b5eb-d2503aa752b4.
--   - À appliquer APRÈS S5 complet (code écrivant tenant_id partout).
--   - À appliquer AVANT enforce_tenant_id_composite_constraints.sql.
--
-- DÉCISION RLS (option A — scoping applicatif, validée S6a) :
--   RLS hardening (option B) volontairement reporté en V2 multi-tenant.
--   Le scoping est assuré au niveau applicatif :
--     - bot v1 endpoints (S3)
--     - admin API endpoints (S5b/bis)
--     - public + user-level API (S5c)
--     - SSR pages (S5d)
--     - Helpers cross-cutting (S5a)
--   Tous filtrent .eq('tenant_id', tenantId) sur les 32 tables scoped.
--   Quand un 2e tenant arrivera, option B (predicat tenant_id sur policies
--   anon via current_setting('app.current_tenant_id')) pourra être ajoutée
--   en migration additive sans casser ce qui existe.

BEGIN;

-- ============================================================
-- Phase A — Re-backfill safety net (no-op attendu)
-- ============================================================
-- Pour chaque table scoped, on s'assure que toute row arrivée entre le sweep
-- de validation S3 et l'apply de cette migration est aussi rattachée à
-- conference. Si une de ces UPDATE renvoie > 0, c'est qu'on a une fenêtre
-- de course à investiguer post-migration (mais on ne bloque pas l'apply).

UPDATE public.admin_idempotency          SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.announcements              SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.bot_event_outbox           SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.bot_idempotency            SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.bot_locks                  SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.bot_player_actions         SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.bracket_snapshots          SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.cast_assignments           SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.cast_members               SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.demandes                   SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.discord_webhooks           SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.games                      SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.match_map_vetos            SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.match_mvp_polls            SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.match_score_reports        SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.matches                    SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.news                       SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.news_comments              SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.player_action_snoozes      SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.scrims                     SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.staff_logs                 SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.stage_teams                SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.stage_tiebreaker_overrides SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.team_audit_logs            SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.team_members               SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.teams                      SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.tournament_maps            SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.tournament_stages          SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.tournament_teams           SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;
UPDATE public.tournaments                SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4' WHERE tenant_id IS NULL;

-- ============================================================
-- Phase B — SET NOT NULL idempotent
-- ============================================================
DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'admin_idempotency','announcements','bot_event_outbox','bot_idempotency',
    'bot_locks','bot_player_actions','bracket_snapshots','cast_assignments',
    'cast_members','demandes','discord_webhooks','games','match_map_vetos',
    'match_mvp_polls','match_score_reports','matches','news','news_comments',
    'player_action_snoozes','scrims','staff_logs','stage_teams',
    'stage_tiebreaker_overrides','team_audit_logs','team_members','teams',
    'tournament_maps','tournament_stages','tournament_teams','tournaments'
  ];
  v_nullable text;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    SELECT is_nullable INTO v_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = v_table
      AND column_name = 'tenant_id';

    IF v_nullable = 'YES' THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', v_table);
      RAISE NOTICE 'SET NOT NULL applied on %.tenant_id', v_table;
    ELSE
      RAISE NOTICE 'SET NOT NULL skip (already NOT NULL) on %.tenant_id', v_table;
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- Phase C — ADD FK NOT VALID puis VALIDATE séparément
-- ============================================================
-- FK NOT VALID = aucun scan immédiat, lock court (ACCESS EXCLUSIVE bref).
-- VALIDATE CONSTRAINT scanne ensuite la table avec un SHARE UPDATE EXCLUSIVE
-- (n'empêche pas SELECT / INSERT / UPDATE / DELETE concurrents).
DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'admin_idempotency','announcements','bot_event_outbox','bot_idempotency',
    'bot_locks','bot_player_actions','bracket_snapshots','cast_assignments',
    'cast_members','demandes','discord_webhooks','games','match_map_vetos',
    'match_mvp_polls','match_score_reports','matches','news','news_comments',
    'player_action_snoozes','scrims','staff_logs','stage_teams',
    'stage_tiebreaker_overrides','team_audit_logs','team_members','teams',
    'tournament_maps','tournament_stages','tournament_teams','tournaments'
  ];
  v_fkname text;
  v_exists boolean;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    v_fkname := v_table || '_tenant_id_fkey';

    SELECT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = v_fkname
        AND conrelid = format('public.%I', v_table)::regclass
    ) INTO v_exists;

    IF NOT v_exists THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT NOT VALID',
        v_table, v_fkname
      );
      RAISE NOTICE 'FK % added NOT VALID', v_fkname;
    ELSE
      RAISE NOTICE 'FK % skip (already exists)', v_fkname;
    END IF;

    -- VALIDATE est lui-même idempotent : si déjà valide, c'est un no-op.
    EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', v_table, v_fkname);
    RAISE NOTICE 'FK % validated', v_fkname;
  END LOOP;
END $$;

-- ============================================================
-- Phase D — Assertion finale : toutes les colonnes tenant_id sont NOT NULL
--                              et toutes les FK existent et sont valides.
-- ============================================================
DO $$
DECLARE
  v_missing_not_null int;
  v_missing_fk       int;
BEGIN
  SELECT count(*) INTO v_missing_not_null
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND column_name = 'tenant_id'
    AND is_nullable = 'YES';

  SELECT count(*) INTO v_missing_fk
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.column_name = 'tenant_id'
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint pgc
      WHERE pgc.conname = c.table_name || '_tenant_id_fkey'
        AND pgc.conrelid = format('public.%I', c.table_name)::regclass
        AND pgc.convalidated = true
    );

  IF v_missing_not_null > 0 THEN
    RAISE EXCEPTION 'Phase 3 step 1: % colonnes tenant_id encore nullable', v_missing_not_null;
  END IF;
  IF v_missing_fk > 0 THEN
    RAISE EXCEPTION 'Phase 3 step 1: % colonnes tenant_id sans FK valide', v_missing_fk;
  END IF;
END $$;

COMMIT;

-- Recharge le cache PostgREST pour exposer la nouvelle FK aux embeds.
NOTIFY pgrst, 'reload schema';
