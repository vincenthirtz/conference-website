-- Migration: Kanban interne — extras de carte (commentaires + checklist)
-- Date: 2026-07-25
--
-- WHY:
--   Les cartes du Kanban interne (`tasks`) gagnent deux capacités par carte :
--     - `task_comments`         : un fil de discussion (staff qui échangent sur
--                                 l'avancement d'une tâche).
--     - `task_checklist_items`  : des sous-tâches / cases à cocher pour découper
--                                 une carte en étapes.
--   Comme les tables `task_boards` / `task_columns` / `tasks`, ce n'est PAS une
--   donnée publique : aucune page vitrine ne la lit. L'accès se fait uniquement
--   côté serveur via `supabaseAdmin` (service_role) depuis les routes admin. On
--   applique donc la même doctrine RLS default-deny : RLS activé, AUCUNE policy
--   — anon et auth sont bloqués, seul service_role passe.
--
--   Multi-tenant : chaque table porte `tenant_id` (NOT NULL, FK → tenants) pour
--   rester cohérente avec le reste du schéma. En V1 mono-tenant les rows portent
--   `DEFAULT_TENANT_ID` (ce69a726-773e-4d12-b5eb-d2503aa752b4).
--
-- CAVEATS:
--   - Idempotente : `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
--     contraintes inline dans le CREATE TABLE. Ré-exécutable sans erreur.
--   - `task_id` est `ON DELETE CASCADE` : supprimer physiquement une carte
--     détruit ses commentaires et sa checklist. Rappel : la suppression courante
--     d'une carte est un soft-delete (`tasks.deleted_at`), pas un DELETE physique
--     — les extras survivent donc à un soft-delete et restent liés à la carte.
--   - `author_staff_id` est NULLable + `ON DELETE SET NULL` : supprimer un membre
--     du staff ne doit jamais effacer les commentaires, on perd juste l'auteur.
--   - `staff` reste une table GLOBALE (pas de tenant_id) — décision produit ; on
--     référence donc `staff(id)` sans scoping tenant sur la FK.
--   - Nouvelles FKs → PostgREST doit recharger son schema cache pour exposer les
--     embeds (?select=*,task_comments(*), task_checklist_items(*), staff(*)). Le
--     `NOTIFY pgrst, 'reload schema'` final s'en charge si exécuté via SQL
--     Editor / apply_migration ; sinon cliquer "Reload schema cache" dans la
--     Dashboard Supabase (Settings → API).

BEGIN;

-- ===========================================================================
-- 1) task_comments — fil de discussion d'une carte
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.task_comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  task_id         uuid NOT NULL,
  author_staff_id uuid,
  body            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_comments_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT task_comments_task_id_fkey
    FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE,
  CONSTRAINT task_comments_author_staff_id_fkey
    FOREIGN KEY (author_staff_id) REFERENCES public.staff(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_task_comments_tenant_id
  ON public.task_comments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id
  ON public.task_comments (task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_author_staff_id
  ON public.task_comments (author_staff_id);
-- Affichage du fil : commentaires d'une carte triés chronologiquement.
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id_created_at
  ON public.task_comments (task_id, created_at);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.task_comments IS
  'Fil de discussion d''une carte Kanban interne (staff-only). Accès service_role uniquement (RLS default-deny, aucune policy).';
COMMENT ON COLUMN public.task_comments.tenant_id IS
  'Tenant propriétaire (dénormalisé depuis la carte pour scoping direct). = DEFAULT_TENANT_ID en V1.';
COMMENT ON COLUMN public.task_comments.task_id IS
  'Carte parente. ON DELETE CASCADE : supprimer physiquement la carte supprime ses commentaires (le soft-delete tasks.deleted_at les conserve).';
COMMENT ON COLUMN public.task_comments.author_staff_id IS
  'Membre du staff auteur du commentaire. NULL si inconnu ou staff supprimé (ON DELETE SET NULL).';
COMMENT ON COLUMN public.task_comments.body IS
  'Contenu du commentaire (texte libre).';

-- ===========================================================================
-- 2) task_checklist_items — sous-tâches d'une carte
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.task_checklist_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  task_id    uuid NOT NULL,
  label      text NOT NULL,
  is_done    boolean NOT NULL DEFAULT false,
  position   int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_checklist_items_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT task_checklist_items_task_id_fkey
    FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_checklist_items_tenant_id
  ON public.task_checklist_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_checklist_items_task_id
  ON public.task_checklist_items (task_id);
-- Rendu / réordonnancement de la checklist : items d'une carte triés par position.
CREATE INDEX IF NOT EXISTS idx_task_checklist_items_task_id_position
  ON public.task_checklist_items (task_id, position);

ALTER TABLE public.task_checklist_items ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.task_checklist_items IS
  'Sous-tâches (cases à cocher) d''une carte Kanban interne (staff-only). Accès service_role uniquement (RLS default-deny, aucune policy).';
COMMENT ON COLUMN public.task_checklist_items.tenant_id IS
  'Tenant propriétaire (dénormalisé depuis la carte pour scoping direct). = DEFAULT_TENANT_ID en V1.';
COMMENT ON COLUMN public.task_checklist_items.task_id IS
  'Carte parente. ON DELETE CASCADE : supprimer physiquement la carte supprime sa checklist (le soft-delete tasks.deleted_at la conserve).';
COMMENT ON COLUMN public.task_checklist_items.label IS
  'Libellé de la sous-tâche.';
COMMENT ON COLUMN public.task_checklist_items.is_done IS
  'Case cochée : sous-tâche terminée. Défaut false.';
COMMENT ON COLUMN public.task_checklist_items.position IS
  'Ordre de l''item dans la checklist de la carte (croissant). Défaut 0.';

COMMIT;

-- Nouvelles tables + FKs : PostgREST doit recharger son schema cache pour
-- exposer les embeds (task_comments/task_checklist_items/staff) via ?select=.
NOTIFY pgrst, 'reload schema';
