-- Migration: Kanban interne — définitions de labels colorés par board
-- Date: 2026-07-25
--
-- WHY:
--   Les cartes du Kanban (`tasks.labels text[]`) stockent aujourd'hui des labels
--   en TEXTE BRUT : chaque carte porte une liste de NOMS de labels, sans couleur
--   ni définition partagée. On garde ce champ tel quel pour la back-compat (le
--   bot et les données existantes continuent d'écrire/lire des noms).
--
--   Cette table `task_labels` ajoute, à côté, un CATALOGUE de définitions de
--   labels par board : un nom + une couleur. Elle sert à :
--     - colorer les pastilles dans l'UI (chaque nom de label → une couleur),
--     - gérer les labels (créer / renommer / recolorer / ordonner) au niveau board.
--   Le lien carte ↔ définition se fait par le NOM : `tasks.labels[]` contient des
--   noms, `task_labels.name` porte la définition/couleur de ce nom. Un label
--   présent sur une carte mais SANS définition correspondante s'affiche en couleur
--   neutre (pas de jointure dure : c'est volontairement souple pour la back-compat).
--
--   Comme le reste du Kanban : donnée staff-only, aucune page vitrine ne la lit.
--   Accès exclusivement côté serveur via `supabaseAdmin` (service_role). Doctrine
--   RLS default-deny : RLS activé, AUCUNE policy — anon et auth bloqués, seul
--   service_role passe (même pattern que task_boards / task_columns / tasks).
--
--   Multi-tenant : `tenant_id` (NOT NULL, FK → tenants). En V1 mono-tenant les
--   rows portent `DEFAULT_TENANT_ID` (ce69a726-773e-4d12-b5eb-d2503aa752b4).
--
-- CAVEATS:
--   - Idempotente : `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
--     contraintes inline dans le CREATE TABLE. Ré-exécutable sans erreur.
--   - `board_id` est `ON DELETE CASCADE` : supprimer un board détruit ses
--     définitions de labels (les noms restent inertes dans tasks.labels[] mais
--     retombent en couleur neutre, ce qui est le comportement voulu).
--   - Le lien carte↔label est par NOM, pas par FK : renommer une définition ici
--     NE renomme PAS les occurrences dans tasks.labels[] (à gérer côté API si
--     souhaité). C'est un choix assumé pour ne pas casser la back-compat bot.
--   - UNIQUE (board_id, name) : un nom de label est unique par board (pas de
--     doublon de couleur pour un même nom). La casse n'est PAS normalisée ici.
--   - `color` est validé par un CHECK au format hex '#rrggbb'.
--   - Nouvelle FK → PostgREST doit recharger son schema cache pour exposer les
--     embeds (?select=*,task_labels(*), task_boards!board_id(...)). Le
--     `NOTIFY pgrst, 'reload schema'` final s'en charge si exécuté via SQL
--     Editor / apply_migration ; sinon cliquer "Reload schema cache" dans la
--     Dashboard Supabase (Settings → API).

BEGIN;

CREATE TABLE IF NOT EXISTS public.task_labels (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  board_id   uuid NOT NULL,
  name       text NOT NULL,
  color      text NOT NULL,
  position   int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_labels_color_chk
    CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  CONSTRAINT task_labels_board_id_name_key
    UNIQUE (board_id, name),
  CONSTRAINT task_labels_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT task_labels_board_id_fkey
    FOREIGN KEY (board_id) REFERENCES public.task_boards(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_labels_tenant_id
  ON public.task_labels (tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_labels_board_id
  ON public.task_labels (board_id);

ALTER TABLE public.task_labels ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.task_labels IS
  'Catalogue de définitions de labels colorés par board Kanban (staff-only). Porte nom + couleur ; le lien avec les cartes se fait par NOM (tasks.labels[]), pas par FK. Accès service_role uniquement (RLS default-deny, aucune policy).';
COMMENT ON COLUMN public.task_labels.tenant_id IS
  'Tenant propriétaire (dénormalisé depuis le board pour scoping direct). En V1 mono-tenant = DEFAULT_TENANT_ID (ce69a726-773e-4d12-b5eb-d2503aa752b4).';
COMMENT ON COLUMN public.task_labels.board_id IS
  'Board parent. ON DELETE CASCADE : supprimer le board supprime ses définitions de labels.';
COMMENT ON COLUMN public.task_labels.name IS
  'Nom du label. C''est la CLÉ de liaison avec les cartes : tasks.labels[] stocke ces noms en texte brut (back-compat bot). Unique par board (task_labels_board_id_name_key). Un nom présent sur une carte sans ligne ici s''affiche en couleur neutre.';
COMMENT ON COLUMN public.task_labels.color IS
  'Couleur de la pastille au format hex ''#rrggbb'' (CHECK task_labels_color_chk). C''est la seule définition visuelle portée par cette table.';
COMMENT ON COLUMN public.task_labels.position IS
  'Ordre d''affichage des labels dans le gestionnaire du board (croissant). Défaut 0.';

COMMIT;

-- Nouvelle table + FKs : PostgREST doit recharger son schema cache pour exposer
-- les embeds (task_labels/task_boards) via ?select=.
NOTIFY pgrst, 'reload schema';
