-- Migration: équipes ouvertes au recrutement par défaut + backfill
-- Date: 2026-06-27
--
-- WHY (bug réel) : la page « rejoindre une équipe » filtre sur is_joinable=true.
--   Or is_joinable avait pour défaut false et n'était jamais posé à la création
--   d'équipe → les capitaines devaient l'activer manuellement (toggle), ce qu'ils
--   ne faisaient pas. Résultat : les joueuses ne trouvaient (presque) AUCUNE
--   équipe à rejoindre alors que plusieurs avaient des places libres.
-- WHAT :
--   - Défaut de is_joinable passé à TRUE (les équipes acceptent les demandes par
--     défaut ; le capitaine garde le toggle pour fermer une équipe pleine/privée).
--   - Backfill : les équipes existantes NON pleines (< 5 membres) repassent
--     joinable=true (les pleines restent fermées). Idempotent.
-- Appliqué en prod via MCP le 2026-06-27.

ALTER TABLE public.teams ALTER COLUMN is_joinable SET DEFAULT true;

UPDATE public.teams t
SET is_joinable = true
WHERE t.is_joinable IS DISTINCT FROM true
  AND (SELECT count(*) FROM public.team_members tm WHERE tm.team_id = t.id) < 5;
