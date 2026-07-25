-- Migration: Kanban interne (gestion de tâches de l'association) — schéma
-- Date: 2026-07-25
--
-- WHY:
--   L'association a besoin d'un tableau Kanban interne, staff-only, pour suivre
--   ses tâches (organisation d'événements, com', logistique…). Trois tables :
--     - `task_boards`   : les tableaux (ex. "Association", "Événement X").
--     - `task_columns`  : les colonnes ordonnées d'un board (À faire → Terminé).
--     - `tasks`         : les cartes, rattachées à une colonne d'un board.
--   Ce n'est PAS une donnée publique : aucune page vitrine ne la lit. L'accès
--   se fait exclusivement côté serveur via `supabaseAdmin` (service_role) depuis
--   les routes admin. On applique donc la doctrine RLS default-deny : RLS
--   activé, AUCUNE policy — anon et auth sont bloqués, seul service_role passe
--   (même pattern que `bot_event_outbox`, `bot_idempotency`, etc.).
--
--   Multi-tenant : chaque table porte `tenant_id` (NOT NULL, FK → tenants) pour
--   rester cohérente avec le reste du schéma. En V1 mono-tenant les rows
--   portent `DEFAULT_TENANT_ID` (ce69a726-773e-4d12-b5eb-d2503aa752b4).
--
-- CAVEATS:
--   - Idempotente : `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
--     contraintes ajoutées inline dans le CREATE TABLE (donc pas ré-ajoutées si
--     la table existe déjà). Ré-exécutable sans erreur.
--   - `assignee_staff_id` et `created_by` sont NULLables + `ON DELETE SET NULL` :
--     supprimer un membre du staff ne doit jamais supprimer ses tâches/boards,
--     on perd juste l'attribution.
--   - `board_id` / `column_id` sont `ON DELETE CASCADE` : supprimer un board
--     détruit ses colonnes et ses cartes ; supprimer une colonne détruit ses
--     cartes. La suppression logique quotidienne d'une carte passe par
--     `deleted_at` (soft-delete), pas par un DELETE physique.
--   - `staff` reste une table GLOBALE (pas de tenant_id) — décision produit ;
--     on référence donc `staff(id)` sans scoping tenant sur la FK.
--   - Nouvelles FKs → PostgREST doit recharger son schema cache pour exposer les
--     embeds (?select=*,task_columns(*), tasks!board_id(...), staff(*)). Le
--     `NOTIFY pgrst, 'reload schema'` final s'en charge si exécuté via SQL
--     Editor / apply_migration ; sinon cliquer "Reload schema cache" dans la
--     Dashboard Supabase (Settings → API).

BEGIN;

-- ===========================================================================
-- 1) task_boards — les tableaux Kanban
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.task_boards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  name        text NOT NULL,
  description text,
  position    int NOT NULL DEFAULT 0,
  is_archived boolean NOT NULL DEFAULT false,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_boards_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT task_boards_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.staff(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_task_boards_tenant_id
  ON public.task_boards (tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_boards_created_by
  ON public.task_boards (created_by);

ALTER TABLE public.task_boards ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.task_boards IS
  'Tableaux Kanban internes (staff-only). Accès service_role uniquement (RLS default-deny, aucune policy).';
COMMENT ON COLUMN public.task_boards.tenant_id IS
  'Tenant propriétaire. En V1 mono-tenant = DEFAULT_TENANT_ID (ce69a726-773e-4d12-b5eb-d2503aa752b4).';
COMMENT ON COLUMN public.task_boards.name IS
  'Nom du tableau affiché dans l''UI admin (ex. "Association").';
COMMENT ON COLUMN public.task_boards.description IS
  'Description libre optionnelle du tableau.';
COMMENT ON COLUMN public.task_boards.position IS
  'Ordre d''affichage des boards entre eux (croissant). Défaut 0.';
COMMENT ON COLUMN public.task_boards.is_archived IS
  'Board archivé : masqué des listes actives sans être supprimé.';
COMMENT ON COLUMN public.task_boards.created_by IS
  'Membre du staff ayant créé le board. NULL si inconnu ou staff supprimé (ON DELETE SET NULL).';

-- ===========================================================================
-- 2) task_columns — les colonnes ordonnées d'un board
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.task_columns (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  board_id   uuid NOT NULL,
  name       text NOT NULL,
  position   int NOT NULL,
  wip_limit  int,
  is_done    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_columns_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT task_columns_board_id_fkey
    FOREIGN KEY (board_id) REFERENCES public.task_boards(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_columns_tenant_id
  ON public.task_columns (tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_columns_board_id
  ON public.task_columns (board_id);

ALTER TABLE public.task_columns ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.task_columns IS
  'Colonnes ordonnées d''un board Kanban (staff-only). Accès service_role uniquement (RLS default-deny).';
COMMENT ON COLUMN public.task_columns.tenant_id IS
  'Tenant propriétaire (dénormalisé depuis le board pour scoping direct). = DEFAULT_TENANT_ID en V1.';
COMMENT ON COLUMN public.task_columns.board_id IS
  'Board parent. ON DELETE CASCADE : supprimer le board supprime ses colonnes.';
COMMENT ON COLUMN public.task_columns.name IS
  'Libellé de la colonne (ex. "À faire", "En cours").';
COMMENT ON COLUMN public.task_columns.position IS
  'Ordre de la colonne dans le board, de gauche (0) à droite.';
COMMENT ON COLUMN public.task_columns.wip_limit IS
  'Limite WIP optionnelle (nombre max de cartes conseillé). NULL = pas de limite.';
COMMENT ON COLUMN public.task_columns.is_done IS
  'Colonne terminale : une carte qui y arrive est considérée "terminée".';

-- ===========================================================================
-- 3) tasks — les cartes
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  board_id          uuid NOT NULL,
  column_id         uuid NOT NULL,
  title             text NOT NULL,
  description       text,
  priority          text NOT NULL DEFAULT 'medium',
  assignee_staff_id uuid,
  due_date          date,
  position          int NOT NULL DEFAULT 0,
  labels            text[] NOT NULL DEFAULT '{}',
  created_by        uuid,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_priority_chk
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  CONSTRAINT tasks_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT tasks_board_id_fkey
    FOREIGN KEY (board_id) REFERENCES public.task_boards(id) ON DELETE CASCADE,
  CONSTRAINT tasks_column_id_fkey
    FOREIGN KEY (column_id) REFERENCES public.task_columns(id) ON DELETE CASCADE,
  CONSTRAINT tasks_assignee_staff_id_fkey
    FOREIGN KEY (assignee_staff_id) REFERENCES public.staff(id) ON DELETE SET NULL,
  CONSTRAINT tasks_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.staff(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_id
  ON public.tasks (tenant_id);
-- Réordonnancement / rendu d'une colonne : cartes triées par position.
CREATE INDEX IF NOT EXISTS idx_tasks_column_id_position
  ON public.tasks (column_id, position);
-- Listing d'un board (cartes vivantes uniquement) : index partiel deleted_at IS NULL.
CREATE INDEX IF NOT EXISTS idx_tasks_board_id_active
  ON public.tasks (board_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_staff_id
  ON public.tasks (assignee_staff_id);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.tasks IS
  'Cartes du Kanban interne (staff-only). Soft-delete via deleted_at. Accès service_role uniquement (RLS default-deny).';
COMMENT ON COLUMN public.tasks.tenant_id IS
  'Tenant propriétaire (dénormalisé). = DEFAULT_TENANT_ID en V1.';
COMMENT ON COLUMN public.tasks.board_id IS
  'Board parent (dénormalisé depuis la colonne pour lister par board sans jointure). ON DELETE CASCADE.';
COMMENT ON COLUMN public.tasks.column_id IS
  'Colonne courante de la carte. ON DELETE CASCADE : supprimer la colonne supprime ses cartes.';
COMMENT ON COLUMN public.tasks.title IS
  'Titre de la carte.';
COMMENT ON COLUMN public.tasks.description IS
  'Description / détail de la tâche (texte libre optionnel).';
COMMENT ON COLUMN public.tasks.priority IS
  'Priorité : low | medium | high | urgent (CHECK, pas d''ENUM Postgres). Défaut medium.';
COMMENT ON COLUMN public.tasks.assignee_staff_id IS
  'Membre du staff assigné. NULL si non assigné ou staff supprimé (ON DELETE SET NULL).';
COMMENT ON COLUMN public.tasks.due_date IS
  'Échéance optionnelle (date, sans heure).';
COMMENT ON COLUMN public.tasks.position IS
  'Ordre de la carte dans sa colonne (croissant). Défaut 0.';
COMMENT ON COLUMN public.tasks.labels IS
  'Étiquettes libres (tableau de texte). Défaut tableau vide.';
COMMENT ON COLUMN public.tasks.created_by IS
  'Membre du staff ayant créé la carte. NULL si inconnu ou staff supprimé (ON DELETE SET NULL).';
COMMENT ON COLUMN public.tasks.deleted_at IS
  'Horodatage de soft-delete. Les lectures filtrent deleted_at IS NULL ; NULL = carte active.';

COMMIT;

-- Nouvelles tables + FKs : PostgREST doit recharger son schema cache pour
-- exposer les embeds (task_columns/tasks/staff) via ?select=.
NOTIFY pgrst, 'reload schema';
