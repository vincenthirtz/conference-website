-- =============================================================================
-- Phase 1b — Multi-tenant: add tenant_id to match domain (13 tables)
-- =============================================================================
--
-- WHY
--   Phase 1a a posé tenant_id sur les racines (tournaments, tournament_stages,
--   teams, scrims, cast_members, announcements, news, news_comments,
--   discord_guilds, discord_webhooks, tenant_staff). Phase 1b descend
--   tenant_id sur les tables enfant du domaine "match" pour qu'on puisse
--   filtrer par tenant sans JOIN multi-hop.
--
-- PATTERN (identique à Phase 1a)
--   1. ADD COLUMN IF NOT EXISTS tenant_id uuid (nullable, sans FK).
--   2. CREATE INDEX IF NOT EXISTS idx_<t>_tenant_id ON <t>(tenant_id).
--   3. Backfill via UPDATE JOIN sur la table parent — WHERE tenant_id IS NULL
--      pour l'idempotence.
--   4. Pas de NOT NULL, pas de FK vers tenants (Phase 1d).
--
-- ORDRE DES UPDATE (chaîne FK)
--   Tier 1 racines (Phase 1a): tournaments, tournament_stages, teams, scrims.
--   Tier 2 (cette migration, niveau 1) :
--     - matches            ← tournaments.tenant_id (fallback: stages, scrims)
--     - tournament_maps    ← tournaments.tenant_id
--     - tournament_teams   ← tournaments.tenant_id
--     - stage_teams        ← tournament_stages.tenant_id
--     - bracket_snapshots  ← tournament_stages.tenant_id
--     - stage_tiebreaker_overrides ← tournament_stages.tenant_id
--     - team_members       ← teams.tenant_id
--     - team_audit_logs    ← teams.tenant_id
--   Tier 3 (cette migration, niveau 2 — dépend de matches) :
--     - games                ← matches.tenant_id
--     - match_score_reports  ← matches.tenant_id
--     - match_map_vetos      ← matches.tenant_id
--     - match_mvp_polls      ← matches.tenant_id
--     - cast_assignments     ← matches.tenant_id
--
-- CAVEATS
--   - matches a 3 chemins parents (tournament_id, stage_id, scrim_id). On
--     backfill via tournament en priorité, puis fallback stage, puis scrim.
--     Aujourd'hui (2026-05-20) tous les 93 matches ont tournament_id NOT NULL,
--     mais le fallback rend la migration safe pour le futur.
--   - games hérite uniquement de matches (pas de scrim_id direct sur games).
--   - cast_assignments.match_id est NOT NULL → pas de fallback nécessaire.
--   - Validation finale: assertion que toutes les tables ont 0 ligne avec
--     tenant_id NULL. La migration ROLLBACK si une ligne échappe au backfill.
--   - NOTIFY pgrst en fin (les colonnes nouvelles doivent être visibles via
--     PostgREST pour les futurs filtres ?tenant_id=eq.).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. ADD COLUMN + INDEX (idempotent)
-- -----------------------------------------------------------------------------

ALTER TABLE matches                     ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE games                       ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE match_score_reports         ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE match_map_vetos             ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE match_mvp_polls             ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE cast_assignments            ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE stage_teams                 ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE bracket_snapshots           ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE stage_tiebreaker_overrides  ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE team_members                ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE team_audit_logs             ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE tournament_maps             ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE tournament_teams            ADD COLUMN IF NOT EXISTS tenant_id uuid;

CREATE INDEX IF NOT EXISTS idx_matches_tenant_id                     ON matches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_games_tenant_id                       ON games(tenant_id);
CREATE INDEX IF NOT EXISTS idx_match_score_reports_tenant_id         ON match_score_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_match_map_vetos_tenant_id             ON match_map_vetos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_match_mvp_polls_tenant_id             ON match_mvp_polls(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cast_assignments_tenant_id            ON cast_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stage_teams_tenant_id                 ON stage_teams(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bracket_snapshots_tenant_id           ON bracket_snapshots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stage_tiebreaker_overrides_tenant_id  ON stage_tiebreaker_overrides(tenant_id);
CREATE INDEX IF NOT EXISTS idx_team_members_tenant_id                ON team_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_team_audit_logs_tenant_id             ON team_audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tournament_maps_tenant_id             ON tournament_maps(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tournament_teams_tenant_id            ON tournament_teams(tenant_id);

-- -----------------------------------------------------------------------------
-- 2. BACKFILL Tier 2 (enfants directs des racines Phase 1a)
-- -----------------------------------------------------------------------------

-- matches: tournament d'abord, puis stage, puis scrim (fallback chain)
UPDATE matches m
SET tenant_id = t.tenant_id
FROM tournaments t
WHERE m.tournament_id = t.id
  AND m.tenant_id IS NULL;

UPDATE matches m
SET tenant_id = s.tenant_id
FROM tournament_stages s
WHERE m.stage_id = s.id
  AND m.tenant_id IS NULL;

UPDATE matches m
SET tenant_id = sc.tenant_id
FROM scrims sc
WHERE m.scrim_id = sc.id
  AND m.tenant_id IS NULL;

-- tournament_maps
UPDATE tournament_maps tm
SET tenant_id = t.tenant_id
FROM tournaments t
WHERE tm.tournament_id = t.id
  AND tm.tenant_id IS NULL;

-- tournament_teams
UPDATE tournament_teams tt
SET tenant_id = t.tenant_id
FROM tournaments t
WHERE tt.tournament_id = t.id
  AND tt.tenant_id IS NULL;

-- stage_teams
UPDATE stage_teams st
SET tenant_id = s.tenant_id
FROM tournament_stages s
WHERE st.stage_id = s.id
  AND st.tenant_id IS NULL;

-- bracket_snapshots
UPDATE bracket_snapshots bs
SET tenant_id = s.tenant_id
FROM tournament_stages s
WHERE bs.stage_id = s.id
  AND bs.tenant_id IS NULL;

-- stage_tiebreaker_overrides
UPDATE stage_tiebreaker_overrides sto
SET tenant_id = s.tenant_id
FROM tournament_stages s
WHERE sto.stage_id = s.id
  AND sto.tenant_id IS NULL;

-- team_members
UPDATE team_members tm
SET tenant_id = t.tenant_id
FROM teams t
WHERE tm.team_id = t.id
  AND tm.tenant_id IS NULL;

-- team_audit_logs
UPDATE team_audit_logs tal
SET tenant_id = t.tenant_id
FROM teams t
WHERE tal.team_id = t.id
  AND tal.tenant_id IS NULL;

-- -----------------------------------------------------------------------------
-- 3. BACKFILL Tier 3 (enfants de matches — DOIT venir après le backfill matches)
-- -----------------------------------------------------------------------------

UPDATE games g
SET tenant_id = m.tenant_id
FROM matches m
WHERE g.match_id = m.id
  AND g.tenant_id IS NULL;

UPDATE match_score_reports msr
SET tenant_id = m.tenant_id
FROM matches m
WHERE msr.match_id = m.id
  AND msr.tenant_id IS NULL;

UPDATE match_map_vetos mmv
SET tenant_id = m.tenant_id
FROM matches m
WHERE mmv.match_id = m.id
  AND mmv.tenant_id IS NULL;

UPDATE match_mvp_polls mmp
SET tenant_id = m.tenant_id
FROM matches m
WHERE mmp.match_id = m.id
  AND mmp.tenant_id IS NULL;

UPDATE cast_assignments ca
SET tenant_id = m.tenant_id
FROM matches m
WHERE ca.match_id = m.id
  AND ca.tenant_id IS NULL;

-- -----------------------------------------------------------------------------
-- 4. ASSERTION: aucune ligne ne doit rester avec tenant_id NULL
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  missing_count int;
BEGIN
  SELECT count(*) INTO missing_count FROM (
    SELECT 1 FROM matches                    WHERE tenant_id IS NULL
    UNION ALL SELECT 1 FROM games            WHERE tenant_id IS NULL
    UNION ALL SELECT 1 FROM match_score_reports        WHERE tenant_id IS NULL
    UNION ALL SELECT 1 FROM match_map_vetos            WHERE tenant_id IS NULL
    UNION ALL SELECT 1 FROM match_mvp_polls            WHERE tenant_id IS NULL
    UNION ALL SELECT 1 FROM cast_assignments           WHERE tenant_id IS NULL
    UNION ALL SELECT 1 FROM stage_teams                WHERE tenant_id IS NULL
    UNION ALL SELECT 1 FROM bracket_snapshots          WHERE tenant_id IS NULL
    UNION ALL SELECT 1 FROM stage_tiebreaker_overrides WHERE tenant_id IS NULL
    UNION ALL SELECT 1 FROM team_members               WHERE tenant_id IS NULL
    UNION ALL SELECT 1 FROM team_audit_logs            WHERE tenant_id IS NULL
    UNION ALL SELECT 1 FROM tournament_maps            WHERE tenant_id IS NULL
    UNION ALL SELECT 1 FROM tournament_teams           WHERE tenant_id IS NULL
  ) s;

  IF missing_count > 0 THEN
    RAISE EXCEPTION 'Phase 1b backfill incomplete: % rows still have tenant_id IS NULL', missing_count;
  END IF;
END $$;

COMMIT;

-- -----------------------------------------------------------------------------
-- 5. Reload PostgREST schema cache (les nouvelles colonnes doivent être visibles)
-- -----------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';
