-- Migration: RLS baseline sur match_score_reports (fondation T1 — self-report de score)
--
-- WHY:
--   La table `match_score_reports` (créée par create_match_score_reports_table.sql,
--   tenant_id ajouté par add_tenant_id_to_match_domain.sql) est la SOURCE du
--   ticket T1 « self-report de score joueur + escalade litige » :
--     - un capitaine soumet le score de son match (côté Discord aujourd'hui via
--       /api/bot/v1/matches/[matchId]/report, côté espace capitaine demain) ;
--     - deux reports concordants -> applyMatchScore() finalise le match ;
--     - deux reports divergents (ou time-out) -> matches.status = 'disputed'
--       (le système de disputes existant, porté par les colonnes dispute_* de
--       matches — il n'y a PAS de table `disputes` séparée).
--
--   La table contient des données sensibles : identité du capitaine
--   (reported_by_auth_user_id = auth.users.id) et discord_user_id. Tout l'accès
--   se fait via supabaseAdmin (service_role) depuis les routes API ; aucun
--   client anon/authenticated ne doit lire ou écrire directement.
--
--   En production, RLS est DÉJÀ activée sur cette table (un INSERT anon renvoie
--   `42501 new row violates row-level security policy`), mais AUCUN fichier de
--   migration versionné ne le documentait — la table était absente de
--   enable_rls_baseline_tables.sql ET de enable_rls_remaining_tables.sql. Cette
--   migration codifie l'état de prod pour supprimer le drift repo/prod et servir
--   de point d'ancrage documentaire à la vague API de T1.
--
-- WHAT:
--   ENABLE ROW LEVEL SECURITY sans AUCUNE policy = pattern « service-role only »,
--   identique à match_map_vetos / bot_idempotency / staff (cf.
--   enable_rls_baseline_tables.sql). Le service_role bypass RLS, donc les
--   handlers serveur (supabaseAdmin) ne sont pas affectés ; seule la porte
--   d'accès direct PostgREST (anon / authenticated) est fermée.
--
--   PAS de policy SELECT publique : les reports de score ne sont jamais lus en
--   direct par un client. La lecture staff passe par /admin (service_role) et la
--   lecture capitaine passera par une route API dédiée (service_role) à la
--   vague suivante — pas par un SELECT PostgREST direct.
--
-- DEPLOY NOTES:
--   - Idempotent : ALTER TABLE ... ENABLE ROW LEVEL SECURITY est ré-exécutable
--     sans erreur même si RLS est déjà activée.
--   - ADDITIF / non destructif : aucune colonne, contrainte ou donnée touchée.
--   - Pas de changement de FK ni de policy -> AUCUN reload du schema cache
--     PostgREST nécessaire pour cette migration.

BEGIN;

ALTER TABLE public.match_score_reports ENABLE ROW LEVEL SECURITY;

-- Volontairement aucune policy : accès exclusivement via supabaseAdmin
-- (service_role). Toute lecture/écriture client direct est refusée par défaut.

COMMIT;
