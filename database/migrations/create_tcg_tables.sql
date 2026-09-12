-- Migration: socle du TCG Women's Cup — cartes de joueuses ET d'équipes,
--            paquets gagnés, contenu des paquets ouverts.
-- Date: 2026-09-13
--
-- WHY:
--   Représenter les joueuses et les équipes par des cartes à collectionner, un
--   paquet étant offert à chaque victoire. Le lien « une victoire → des
--   joueuses nommées » existe déjà : `match_participants` fige le roster d'un
--   match, et `applyMatchRatingIncremental` est l'entonnoir UNIQUE des deux
--   sources de victoire (matchs de tournoi et scrims classés, qui miroitent
--   dans `matches`). C'est donc là que les paquets seront attribués.
--
-- DEUX SUJETS, UN SEUL RÉGIME DE CONSENTEMENT.
--   Une carte représente une joueuse OU une équipe. Seules les joueuses
--   passent par `tcg_player_cards` (accord explicite + photo modérée) : une
--   équipe est déjà publiquement identifiée sur le site par son nom et son
--   logo, il n'y a rien à faire consentir. D'où l'asymétrie assumée entre les
--   deux sujets — ce n'est pas un oubli.
--
-- LA PHOTO N'EST JAMAIS RECOPIÉE DANS LES CARTES DISTRIBUÉES.
--   `tcg_pack_cards` ne référence QUE le sujet, jamais son image. C'est une
--   décision de consentement, pas d'économie de place : une joueuse qui retire
--   son accord doit voir sa photo disparaître des exemplaires DÉJÀ en
--   circulation, pas seulement des futurs. Dénormaliser l'URL dans les cartes
--   rendrait ce retrait impossible à honorer.
--
--   Corollaire assumé : l'affichage d'une carte lit toujours
--   `tcg_player_cards`. Une carte dont la joueuse s'est retirée retombe sur une
--   face sans photo.
--
-- IDEMPOTENCE DES RÉCOMPENSES, PAR CONSTRUCTION.
--   `UNIQUE (tenant_id, user_id, source_match_id)` sur `tcg_packs` : rejouer
--   la greffe — reprise de cron, double appel, correction de score — ne peut
--   pas offrir deux paquets pour le même match. La garantie est dans le
--   schéma, pas dans la prudence de l'appelant. (Cf. l'incident du
--   2026-09-12 : quatre publications Discord en double parce que la seule
--   protection était applicative.)
--
-- PAS DE TABLE `collection`.
--   Ce qu'une joueuse possède se DÉDUIT de ses paquets ouverts. Une table
--   d'agrégat supplémentaire finirait par diverger du détail qui la nourrit ;
--   au volume attendu (quelques cartes par victoire), le comptage à la lecture
--   est gratuit.
--
-- CAVEATS:
--   - Idempotente (IF NOT EXISTS partout, DROP POLICY avant CREATE POLICY).
--   - tenant_id NOT NULL + FK tenants ON DELETE RESTRICT : convention Tier-1.
--   - RLS activée + policy service_role explicite : aucune de ces tables n'est
--     lue directement par le client, tout passe par les routes serveur.
--   - `photo_path` stocke le CHEMIN dans le bucket, pas l'URL publique : le
--     bucket peut changer de nom ou de domaine sans réécrire les lignes.

/* ---------------------------------------------------------------------------
 * 1) tcg_player_cards — carte d'une JOUEUSE (consentement + photo)
 *
 *    Les équipes n'ont pas d'équivalent : leur face se compose du nom et du
 *    logo déjà publics (`teams.name`, `teams.logo_url`).
 * ------------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS public.tcg_player_cards (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,

  -- Consentement. `opted_in_at` NULL = la joueuse n'a jamais accepté d'avoir
  -- une carte ; `revoked_at` non NULL = elle s'est retirée. Les deux sont
  -- conservés : un retrait n'efface pas le fait qu'il y a eu un accord.
  opted_in_at timestamptz,
  revoked_at timestamptz,

  -- Photo fournie par la joueuse, modérée avant publication.
  photo_path text,
  photo_status text NOT NULL DEFAULT 'none'
    CHECK (photo_status IN ('none', 'pending', 'approved', 'rejected')),
  photo_reviewed_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  photo_reviewed_at timestamptz,
  photo_rejected_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (tenant_id, user_id)
);

-- File de modération : les photos en attente, la plus ancienne d'abord.
CREATE INDEX IF NOT EXISTS idx_tcg_player_cards_photo_status
  ON public.tcg_player_cards (tenant_id, photo_status, created_at);

/* ---------------------------------------------------------------------------
 * 2) tcg_packs — un paquet gagné, ouvert ou non
 * ------------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS public.tcg_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,

  -- La collectionneuse : la joueuse qui a gagné le match.
  user_id uuid NOT NULL,

  -- Le match qui l'a offert. ON DELETE CASCADE : un match supprimé emporte la
  -- récompense qu'il justifiait.
  source_match_id uuid NOT NULL
    REFERENCES public.matches(id) ON DELETE CASCADE,

  granted_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,

  -- Le garde-fou central : une victoire = un paquet, quoi qu'il arrive.
  CONSTRAINT tcg_packs_one_per_match UNIQUE (tenant_id, user_id, source_match_id)
);

-- « Mes paquets non ouverts » — la requête de l'espace joueuse.
CREATE INDEX IF NOT EXISTS idx_tcg_packs_unopened
  ON public.tcg_packs (tenant_id, user_id, granted_at DESC)
  WHERE opened_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tcg_packs_user
  ON public.tcg_packs (tenant_id, user_id, granted_at DESC);

/* ---------------------------------------------------------------------------
 * 3) tcg_pack_cards — ce qu'un paquet contenait, figé à l'ouverture
 * ------------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS public.tcg_pack_cards (
  pack_id uuid NOT NULL REFERENCES public.tcg_packs(id) ON DELETE CASCADE,

  -- Rang dans le paquet (0..n-1) : donne un ordre d'affichage stable à
  -- l'ouverture, et forme la clé avec le paquet.
  position smallint NOT NULL,

  -- Le sujet représenté. PAS de photo ni de logo ici — cf. l'en-tête.
  subject_kind text NOT NULL CHECK (subject_kind IN ('player', 'team')),
  card_user_id uuid,
  card_team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,

  -- EXACTEMENT un sujet renseigné, cohérent avec `subject_kind`. Sans cette
  -- contrainte, une carte pourrait n'avoir aucun sujet (invisible) ou deux
  -- (ambiguë) — deux états qu'aucun code d'affichage ne saurait traiter.
  CONSTRAINT tcg_pack_cards_subject_exclusif CHECK (
    (subject_kind = 'player' AND card_user_id IS NOT NULL AND card_team_id IS NULL)
    OR
    (subject_kind = 'team' AND card_team_id IS NOT NULL AND card_user_id IS NULL)
  ),

  -- Rareté et variante FIGÉES au tirage : le palmarès d'une joueuse ou d'une
  -- équipe évolue, mais la carte tirée un jour donné garde ce qu'elle valait
  -- ce jour-là.
  rarity text NOT NULL
    CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  is_foil boolean NOT NULL DEFAULT false,

  PRIMARY KEY (pack_id, position)
);

-- « Qui possède des cartes de telle joueuse / telle équipe » + comptage d'une
-- collection. Deux index partiels plutôt qu'un seul : chaque colonne de sujet
-- est NULL sur la moitié des lignes.
CREATE INDEX IF NOT EXISTS idx_tcg_pack_cards_card_user
  ON public.tcg_pack_cards (card_user_id)
  WHERE card_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tcg_pack_cards_card_team
  ON public.tcg_pack_cards (card_team_id)
  WHERE card_team_id IS NOT NULL;

/* ---------------------------------------------------------------------------
 * RLS — service_role uniquement : rien n'est lu par le client en direct.
 * ------------------------------------------------------------------------- */

ALTER TABLE public.tcg_player_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcg_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcg_pack_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tcg_player_cards_service_role ON public.tcg_player_cards;
CREATE POLICY tcg_player_cards_service_role ON public.tcg_player_cards
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tcg_packs_service_role ON public.tcg_packs;
CREATE POLICY tcg_packs_service_role ON public.tcg_packs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tcg_pack_cards_service_role ON public.tcg_pack_cards;
CREATE POLICY tcg_pack_cards_service_role ON public.tcg_pack_cards
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.tcg_player_cards IS
  'Carte TCG d''une joueuse : consentement explicite + photo modérée. La photo n''est jamais recopiée dans tcg_pack_cards, pour qu''un retrait de consentement atteigne aussi les exemplaires déjà distribués. Les équipes n''ont pas d''équivalent : leur face vient de teams.name / teams.logo_url, déjà publics.';
COMMENT ON TABLE public.tcg_packs IS
  'Paquet offert à une joueuse pour une victoire. UNIQUE (tenant_id, user_id, source_match_id) garantit qu''un match ne peut pas en offrir deux.';
COMMENT ON TABLE public.tcg_pack_cards IS
  'Contenu figé d''un paquet ouvert. Sujet polymorphe (joueuse ou équipe, exactement un). Rareté et variante sont celles du jour du tirage.';
