-- Migration: enable Supabase Realtime on the MOBA draft tables (Lot 3)
-- Date: 2026-05-26
--
-- WHY:
--   Lot 3 plugs the captain / spectator UIs (Lots 4-5) on Supabase Realtime
--   so every ban/pick / timer tick / status transition propagates without
--   polling. We need :
--     - `match_drafts` in the publication so status / current_step /
--       sides / deadline_at changes fan out to subscribers.
--     - `match_draft_steps` in the publication so `hero_id` + `committed_at`
--       updates trigger the UI to re-render the picked/banned grid.
--
-- REPLICA IDENTITY FULL :
--   Without it, Postgres only emits the PK on UPDATE/DELETE — so a subscriber
--   filtering on (draft_id = $X) would never receive an update whose payload
--   doesn't carry that column. With FULL the entire old + new row are sent,
--   which is what the draft UI needs to reason about side / step / hero.
--
-- DEPLOY NOTES:
--   - Idempotent : DO blocks swallow `duplicate_object` (already a member)
--     and `undefined_object` (dev env without the realtime publication).
--   - No FK touched → no PostgREST schema-cache reload needed.
--
-- ROLLBACK:
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.match_drafts;
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.match_draft_steps;
--   ALTER TABLE public.match_drafts        REPLICA IDENTITY DEFAULT;
--   ALTER TABLE public.match_draft_steps   REPLICA IDENTITY DEFAULT;

BEGIN;

ALTER TABLE public.match_drafts      REPLICA IDENTITY FULL;
ALTER TABLE public.match_draft_steps REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.match_drafts;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL; -- publication absente : env de dev sans realtime
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.match_draft_steps;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

COMMIT;
