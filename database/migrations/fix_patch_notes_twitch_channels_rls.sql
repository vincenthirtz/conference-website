-- Migration: drop "always true" write policies on patch_notes and twitch_channels
--
-- WHY:
--   Supabase's linter 0024 (rls_policy_always_true) flagged 5 policies that
--   allow INSERT/UPDATE/DELETE with `WITH CHECK (true)` and/or `USING (true)`
--   for the default role. These policies effectively bypass RLS on the write
--   path, defeating the purpose of having RLS enabled at all.
--
--   Writes to these tables happen exclusively through admin endpoints that
--   use `supabaseAdmin` (service_role). service_role bypasses RLS, so dropping
--   the permissive policies does NOT break any handler — it only closes the
--   anon/auth write hole.
--
-- WHAT:
--   Drop the 2 patch_notes write policies and the 3 twitch_channels write
--   policies. Keep the `*_select_policy` for both (intentional public read).
--
-- CAVEATS:
--   None — these tables are admin-managed via server-side routes only.

BEGIN;

DROP POLICY IF EXISTS patch_notes_insert_policy ON public.patch_notes;
DROP POLICY IF EXISTS patch_notes_update_policy ON public.patch_notes;

DROP POLICY IF EXISTS twitch_channels_insert_policy ON public.twitch_channels;
DROP POLICY IF EXISTS twitch_channels_update_policy ON public.twitch_channels;
DROP POLICY IF EXISTS twitch_channels_delete_policy ON public.twitch_channels;

COMMIT;
