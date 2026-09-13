-- Migration: héros préférés et héros bannis d'une joueuse.
-- Date: 2026-09-13
--
-- WHY:
--   `/hero-picker` laisse déjà choisir un favori et un ban — mais en mémoire du
--   navigateur : rien n'est conservé, rien n'est réutilisable. Ces choix
--   deviennent utiles dès qu'ils PERSISTENT : ils décrivent la joueuse, et le
--   TCG peut s'en servir pour recommander le personnage qui la représente
--   quand elle ne dépose pas de photo.
--
-- POURQUOI UNE TABLE PAR COMPTE, ET PAS DES COLONNES DANS `team_members`.
--   `team_members` est une ligne par (équipe, joueuse). Y loger des préférences
--   les dupliquerait à chaque équipe et les perdrait au départ de l'une — alors
--   qu'un héros favori appartient à la personne, pas à son club du moment. Une
--   joueuse SANS équipe doit d'ailleurs pouvoir les choisir. Même raisonnement
--   et même forme que `user_discord_links` et `player_discovery_profiles` :
--   `auth_user_id` en clé primaire.
--
-- POURQUOI PAS DE `tenant_id`.
--   Un héros préféré ne change pas selon l'organisation. Les tables de liaison
--   par compte (`user_discord_links`, `user_battlenet_links`,
--   `user_twitch_links`) suivent déjà cette règle : ce qui décrit la PERSONNE
--   est global, ce qui décrit sa participation est scopé.
--
-- POURQUOI DES TABLEAUX PLUTÔT QUE SIX COLONNES.
--   Trois emplacements aujourd'hui, et le nombre est un réglage produit
--   (`HERO_PREFERENCE_SLOTS`). Six colonnes figeraient ce réglage dans le
--   schéma : passer à quatre exigerait une migration, alors que la borne est
--   ici une CONTRAINTE, modifiable sans toucher la forme des données.
--
-- CE QUE LES CONTRAINTES GARANTISSENT, et pourquoi elles sont au schéma :
--   - au plus `3` entrées de chaque côté ;
--   - aucun doublon dans une liste (bannir deux fois le même héros n'a pas de
--     sens et fausserait un décompte) ;
--   - aucun héros à la fois préféré ET banni — une contradiction que
--     l'interface doit empêcher, mais que seule la base peut garantir.
--   Les noms eux-mêmes sont validés par l'API contre `utils/heroes/overwatch.ts`
--   (source unique) : les inscrire dans un CHECK obligerait à migrer à chaque
--   nouveau héros du jeu.
--
-- CAVEATS:
--   - Idempotente : CREATE TABLE / INDEX IF NOT EXISTS.
--   - RLS activée SANS policy : donnée de profil, service-role uniquement.
--   - Ajout de table → recharger le cache PostgREST (NOTIFY en fin), sans quoi
--     l'API ne verrait pas la table.
--   - Rollback = DROP TABLE public.player_hero_preferences;

CREATE TABLE IF NOT EXISTS public.player_hero_preferences (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Héros que la joueuse aime jouer, par ordre de préférence décroissant : le
  -- premier sert de recommandation par défaut pour sa carte TCG.
  picks text[] NOT NULL DEFAULT '{}',

  -- Héros qu'elle ne veut pas voir la représenter (ou affronter). Sert aussi
  -- de garde-fou à la recommandation : jamais proposer un héros banni.
  bans text[] NOT NULL DEFAULT '{}',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- `cardinality` plutôt qu'`array_length` : il rend 0 sur un tableau vide là
  -- où `array_length` rend NULL, ce qui évite un `IS NULL OR` à chaque test.
  CONSTRAINT player_hero_prefs_picks_max CHECK (cardinality(picks) <= 3),
  CONSTRAINT player_hero_prefs_bans_max CHECK (cardinality(bans) <= 3),

  -- Un héros ne peut pas être préféré ET banni. Contradiction que l'interface
  -- doit empêcher, mais que seule la base peut GARANTIR — d'où le CHECK, que
  -- l'opérateur de recouvrement `&&` exprime sans sous-requête.
  CONSTRAINT player_hero_prefs_disjoints CHECK (NOT (picks && bans))

  -- PAS DE CONTRAINTE D'UNICITÉ INTRA-LISTE, et ce n'est pas un oubli.
  -- Postgres REFUSE toute sous-requête dans un CHECK (« cannot use subquery in
  -- check constraint », vérifié sur la base avant d'écrire ces lignes), et
  -- l'unicité d'un tableau n'est pas exprimable autrement sans fonction
  -- dédiée. Créer une fonction immuable pour dédoublonner trois éléments serait
  -- disproportionné : l'API valide déjà chaque nom contre le référentiel unique
  -- `utils/heroes/overwatch.ts`, et c'est elle qui écarte les répétitions.
  --
  -- Le partage des responsabilités reste donc celui du reste du socle : ce qui
  -- peut être garanti par le schéma l'est (bornes, disjonction), et ce qui ne
  -- peut pas l'être est validé au seul point d'écriture.
);

COMMENT ON TABLE public.player_hero_preferences IS
  'Héros préférés et bannis d''une joueuse. GLOBAL au compte (pas de tenant_id) : un favori décrit la personne, pas son club du moment. Alimente la recommandation d''illustration de sa carte TCG quand aucune photo n''est déposée.';
COMMENT ON COLUMN public.player_hero_preferences.picks IS
  'Ordre de préférence décroissant : le premier sert de recommandation par défaut. Max 3, sans doublon, disjoint de bans.';
COMMENT ON COLUMN public.player_hero_preferences.bans IS
  'Jamais proposés en recommandation. Max 3, sans doublon, disjoint de picks.';

-- Donnée de profil : service-role only, aucune policy (comme
-- player_discovery_profiles et les tables de liaison).
ALTER TABLE public.player_hero_preferences ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
