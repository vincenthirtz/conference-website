-- Migration: search_path non mutable sur fonctions trigger
-- Date: 2026-06-26
--
-- WHY: advisor Supabase (0011 function_search_path_mutable) — 3 fonctions trigger
--   sans search_path fixé (risque de hijack du search_path). Appliqué en prod via MCP.
-- WHAT: fixe search_path = public, pg_temp (cohérent avec les autres triggers du repo).

ALTER FUNCTION public.handle_caster_scenes_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_match_drafts_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.final_rankings_touch_updated_at() SET search_path = public, pg_temp;
