-- Migration: rétractation (soft-delete) d'un cue — colonnes retracted_at / retracted_by_user_id
-- Date: 2026-07-16
--
-- WHY:
--   Un cue parti par erreur (faute de frappe, mauvais niveau, urgent envoyé à
--   tort) était jusqu'ici IRRÉVERSIBLE : `event_cues` est append-only et l'API
--   Director n'exposait que GET/POST. Côté caster, un cue urgent erroné laissait
--   la UrgentCueModal bloquée — le caster était forcé d'acker un message faux.
--
--   On ajoute une rétractation en SOFT-DELETE (on ne supprime pas la row, on la
--   marque annulée). Choix soft-delete plutôt que hard-DELETE :
--     - Le caster reçoit un realtime UPDATE (pas DELETE) et voit le cue passer
--       à l'état « Annulé » dans son feed — pas une disparition silencieuse qui
--       laisserait douter (« ai-je rêvé ce cue urgent ? »).
--     - Audit conservé : qui a rétracté quoi et quand.
--
--   Un cue rétracté est exclu de `pendingUrgent` côté cockpit (la modal se
--   ferme donc automatiquement) et affiché barré « Annulé » dans les deux feeds.
--
-- COLONNES:
--   - retracted_at         timestamptz NULL : horodatage de rétractation.
--                          NULL = cue actif (cas nominal). Non-NULL = annulé.
--   - retracted_by_user_id uuid NULL : auteur de la rétractation (Director).
--                          Pas de FK vers auth.users (même choix que
--                          created_by_user_id : on évite le couplage au schéma
--                          `auth`, la validation existence est déférée au
--                          handler API qui a déjà l'auth context).
--
-- CAVEATS:
--   - Idempotente : ADD COLUMN IF NOT EXISTS.
--   - Colonnes nullables sans default non-NULL → pas de réécriture de table,
--     backfill implicite à NULL (tous les cues existants restent actifs).
--   - Pas de nouvel index : la rétractation est rare et les feeds filtrent
--     déjà en mémoire sur un jeu borné (limit 50). Le hot path reste
--     idx_event_cues_tenant_run_created.
--   - PostgREST schema cache reload requis (2 nouvelles colonnes sélectionnées
--     explicitement par les handlers admin + caster).

BEGIN;

ALTER TABLE public.event_cues
  ADD COLUMN IF NOT EXISTS retracted_at         timestamptz,
  ADD COLUMN IF NOT EXISTS retracted_by_user_id uuid;

COMMENT ON COLUMN public.event_cues.retracted_at IS
  'Horodatage de rétractation (soft-delete). NULL = cue actif ; non-NULL = annulé par le Director.';
COMMENT ON COLUMN public.event_cues.retracted_by_user_id IS
  'Auteur de la rétractation (Director). Pas de FK auth.users pour éviter le couplage au schéma auth (cf. created_by_user_id).';

COMMIT;

-- ===========================================================================
-- PostgREST schema cache reload
-- ===========================================================================
-- 2 nouvelles colonnes exposées via ?select=...,retracted_at,retracted_by_user_id
-- dans les handlers admin + caster. Reload requis pour qu'elles apparaissent.
-- Si l'API renvoie "column event_cues.retracted_at does not exist" après
-- l'apply, cliquer aussi "Reload schema cache" dans Dashboard → Settings → API.

NOTIFY pgrst, 'reload schema';
