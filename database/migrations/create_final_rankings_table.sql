-- Migration: create final_rankings table (Lot 1 — Tournament Finalization)
--
-- WHY:
--   Until now, the only way to know who won a tournament was to inspect the
--   bracket's grand-final winner or read swiss standings. Both are derivable
--   but neither is *frozen* : a late dispute re-opened, a manual score edit,
--   or a re-seed would silently move the "winner" of a past tournament.
--
--   This table stores the canonical, immutable final ranking that gets locked
--   when staff finalizes a tournament. Once frozen, the public podium page
--   reads from here — bracket changes can't retroactively rewrite history.
--
-- SCHEMA :
--   - (tournament_id, rank)    : one team per rank (no ties for V1).
--   - (tournament_id, team_id) : each team gets exactly one rank.
--   - frozen_at + frozen_by_staff_id : audit trail of who locked the podium.
--   - prize : free text (eg "1500€", "Spot ESL", "—").
--   - notes : free text (eg "Forfeit en finale", "Disqualifié round 3").
--   - tenant_id : multi-tenant scoping, matches all sibling tables.
--
-- DEPLOY NOTES:
--   - Idempotent (CREATE IF NOT EXISTS + DROP/RECREATE constraints).
--   - PostgREST schema cache reload REQUIRED (new FK to tournaments + teams).
--   - RLS : read = public (matches tournaments.is_public pattern), write =
--           service_role only (staff endpoints use supabaseAdmin).

CREATE TABLE IF NOT EXISTS final_rankings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id       UUID NOT NULL,
  tenant_id           UUID NOT NULL,
  team_id             UUID NOT NULL,
  rank                INTEGER NOT NULL,
  prize               TEXT,
  notes               TEXT,
  frozen_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  frozen_by_staff_id  UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Foreign keys (named so PostgREST embedding works predictably)
ALTER TABLE final_rankings
  DROP CONSTRAINT IF EXISTS fk_final_rankings_tournament;
ALTER TABLE final_rankings
  ADD CONSTRAINT fk_final_rankings_tournament
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;

ALTER TABLE final_rankings
  DROP CONSTRAINT IF EXISTS fk_final_rankings_team;
ALTER TABLE final_rankings
  ADD CONSTRAINT fk_final_rankings_team
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE RESTRICT;

ALTER TABLE final_rankings
  DROP CONSTRAINT IF EXISTS fk_final_rankings_tenant;
ALTER TABLE final_rankings
  ADD CONSTRAINT fk_final_rankings_tenant
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE final_rankings
  DROP CONSTRAINT IF EXISTS fk_final_rankings_staff;
ALTER TABLE final_rankings
  ADD CONSTRAINT fk_final_rankings_staff
  FOREIGN KEY (frozen_by_staff_id) REFERENCES staff(id) ON DELETE SET NULL;

-- Uniqueness : one team per rank, one rank per team, scoped to tournament
ALTER TABLE final_rankings
  DROP CONSTRAINT IF EXISTS uniq_final_rankings_tournament_rank;
ALTER TABLE final_rankings
  ADD CONSTRAINT uniq_final_rankings_tournament_rank
  UNIQUE (tournament_id, rank);

ALTER TABLE final_rankings
  DROP CONSTRAINT IF EXISTS uniq_final_rankings_tournament_team;
ALTER TABLE final_rankings
  ADD CONSTRAINT uniq_final_rankings_tournament_team
  UNIQUE (tournament_id, team_id);

-- Rank sanity
ALTER TABLE final_rankings
  DROP CONSTRAINT IF EXISTS chk_final_rankings_rank_positive;
ALTER TABLE final_rankings
  ADD CONSTRAINT chk_final_rankings_rank_positive
  CHECK (rank >= 1);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_final_rankings_tournament
  ON final_rankings (tournament_id, rank);
CREATE INDEX IF NOT EXISTS idx_final_rankings_tenant
  ON final_rankings (tenant_id);
CREATE INDEX IF NOT EXISTS idx_final_rankings_team
  ON final_rankings (team_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION final_rankings_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_final_rankings_updated_at ON final_rankings;
CREATE TRIGGER trg_final_rankings_updated_at
  BEFORE UPDATE ON final_rankings
  FOR EACH ROW EXECUTE FUNCTION final_rankings_touch_updated_at();

-- RLS : read = public (tournament results are public domain once frozen),
--       write = service_role only (no anon/authenticated direct writes).
ALTER TABLE final_rankings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS final_rankings_read_public ON final_rankings;
CREATE POLICY final_rankings_read_public
  ON final_rankings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS final_rankings_write_service_role ON final_rankings;
CREATE POLICY final_rankings_write_service_role
  ON final_rankings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Reminder for the operator applying this migration :
--   NOTIFY pgrst, 'reload schema';
