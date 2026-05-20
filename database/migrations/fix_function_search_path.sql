-- Migration: pin search_path on all public functions flagged by the security advisor
--
-- WHY:
--   Functions without a fixed `search_path` are vulnerable to schema-hijacking
--   attacks: an attacker who can create a table/function in a schema earlier
--   in the search_path can shadow `public.foo()`. SECURITY DEFINER functions
--   are the worst case but every public function should pin its search_path.
--   Supabase's linter rule 0011 (function_search_path_mutable) flagged 22 of
--   them, all trigger functions.
--
-- WHAT:
--   `ALTER FUNCTION ... SET search_path = public, pg_temp;` for each function.
--   This is metadata-only — the function body is untouched.
--
-- SAFE: ALTER FUNCTION ... SET is idempotent (just overwrites the setting)
--   and runs in milliseconds.

BEGIN;

ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_partners_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_partnership_requests_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_adherents_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_demandes_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_patch_notes_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_twitch_channels_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_member_number() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_blizzard_news_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_blizzard_media_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_cast_member_is_staff_caster() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_cast_members_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_contact_submissions_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_cast_members_on_staff_change() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_site_settings_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_team_max_players() SET search_path = public, pg_temp;
ALTER FUNCTION public.slugify_text(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.teams_set_slug() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_association_pole_members_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.scrims_set_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.match_score_reports_set_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.player_action_snoozes_set_updated_at() SET search_path = public, pg_temp;

COMMIT;
