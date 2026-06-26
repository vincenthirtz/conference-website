-- Migration: index couvrants pour foreign keys non indexées
-- Date: 2026-06-26
--
-- WHY: l'advisor Supabase (0001 unindexed_foreign_keys) signalait 5 FK sans
--   index couvrant → jointures/cascades sous-optimales. Appliqué en prod via MCP.
-- WHAT: un index simple par colonne FK. Idempotent.

CREATE INDEX IF NOT EXISTS idx_caster_presence_event_run_id ON public.caster_presence(event_run_id);
CREATE INDEX IF NOT EXISTS idx_final_rankings_frozen_by_staff_id ON public.final_rankings(frozen_by_staff_id);
CREATE INDEX IF NOT EXISTS idx_match_draft_steps_hero_id ON public.match_draft_steps(hero_id);
CREATE INDEX IF NOT EXISTS idx_player_blacklist_banned_by ON public.player_blacklist(banned_by);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_tenant_id ON public.push_subscriptions(tenant_id);
