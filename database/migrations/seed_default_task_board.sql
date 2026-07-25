-- Migration: Seed du board Kanban par défaut "Association"
-- Date: 2026-07-25
--
-- WHY:
--   Amorce le Kanban interne avec un board prêt à l'emploi pour DEFAULT_TENANT_ID
--   ("Association") et ses 4 colonnes standard : À faire → En cours → En revue →
--   Terminé (colonne terminale is_done=true). Sans ce seed, l'UI admin
--   ouvrirait sur un tableau vide sans colonnes.
--
-- CAVEATS:
--   - Idempotente : UUID littéraux FIXES en PK + `ON CONFLICT (id) DO NOTHING`.
--     Ré-exécutable sans dupliquer ni écraser d'éventuelles modifications
--     (renommage de colonne, réordonnancement) faites après le premier seed.
--   - Ne PAS changer ces UUID une fois appliqués : ils peuvent être référencés
--     en dur par des tests / fixtures.
--   - Dépend de `create_task_board_tables.sql` (à appliquer avant).
--   - Tenant ciblé = DEFAULT_TENANT_ID (ce69a726-773e-4d12-b5eb-d2503aa752b4).
--     Pas de FK nouvelle ici → pas de reload PostgREST nécessaire.

BEGIN;

-- Board "Association" (created_by NULL : seed système, aucun staff acteur).
INSERT INTO public.task_boards (id, tenant_id, name, description, position, is_archived, created_by)
VALUES (
  'a5b0c0de-0000-4000-8000-000000000001'::uuid,
  'ce69a726-773e-4d12-b5eb-d2503aa752b4'::uuid,
  'Association',
  'Tableau de suivi des tâches internes de l''association.',
  0,
  false,
  NULL
)
ON CONFLICT (id) DO NOTHING;

-- 4 colonnes ordonnées. La dernière (Terminé) est la colonne terminale is_done.
INSERT INTO public.task_columns (id, tenant_id, board_id, name, position, wip_limit, is_done)
VALUES
  (
    'a5b0c0de-0000-4000-8000-000000000002'::uuid,
    'ce69a726-773e-4d12-b5eb-d2503aa752b4'::uuid,
    'a5b0c0de-0000-4000-8000-000000000001'::uuid,
    'À faire', 0, NULL, false
  ),
  (
    'a5b0c0de-0000-4000-8000-000000000003'::uuid,
    'ce69a726-773e-4d12-b5eb-d2503aa752b4'::uuid,
    'a5b0c0de-0000-4000-8000-000000000001'::uuid,
    'En cours', 1, NULL, false
  ),
  (
    'a5b0c0de-0000-4000-8000-000000000004'::uuid,
    'ce69a726-773e-4d12-b5eb-d2503aa752b4'::uuid,
    'a5b0c0de-0000-4000-8000-000000000001'::uuid,
    'En revue', 2, NULL, false
  ),
  (
    'a5b0c0de-0000-4000-8000-000000000005'::uuid,
    'ce69a726-773e-4d12-b5eb-d2503aa752b4'::uuid,
    'a5b0c0de-0000-4000-8000-000000000001'::uuid,
    'Terminé', 3, NULL, true
  )
ON CONFLICT (id) DO NOTHING;

COMMIT;
