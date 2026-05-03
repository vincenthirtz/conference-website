-- Migration: Allow captains/managers to customize their team's public page
-- Date: 2026-05-03
--
-- Adds two columns on `teams`:
--   - `public_content` : free markdown content shown on the public team page
--   - `accent_color`   : optional hex color (e.g. "#7c3aed") used for visual
--                        accents on the public page
--
-- Also creates a small audit table `team_audit_logs` to record who edited the
-- public page when. We can't reuse `staff_logs` since captains/managers are
-- not necessarily staff (the FK there points at the `staff` table).

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS public_content text,
  ADD COLUMN IF NOT EXISTS accent_color text;

COMMENT ON COLUMN teams.public_content IS 'Markdown content (sanitized) displayed on the public team page. Editable by users with the edit_public_page team permission.';
COMMENT ON COLUMN teams.accent_color IS 'Optional accent color (hex format like #7c3aed) used on the public team page.';

CREATE TABLE IF NOT EXISTS team_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_audit_logs_team
  ON team_audit_logs(team_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_team_audit_logs_user
  ON team_audit_logs(user_id, created_at DESC);

COMMENT ON TABLE team_audit_logs IS 'Audit trail for team-side actions (captain/manager self-service edits). Visible to staff for moderation.';
