-- Migration : cartes FAN ART — proposées par la communauté, validées par le
--             staff, tirées dans les paquets, et créditées à leur autrice.
-- Date: 2026-09-16
--
-- WHY. Le TCG ne parlait que de ce que la base contient déjà : joueuses,
--   équipes, maps. Une carte dessinée par la communauté ajoute la seule chose
--   qu'aucune requête ne produit — un regard. Et elle rend quelque chose à qui
--   la dessine : un crédit visible, sur la carte et sur une page dédiée.
--
-- UNE SEULE TABLE POUR LA PROPOSITION ET LA CARTE. Le dossier passe de
--   `pending` à `approved` ou `rejected` : deux tables auraient fait exister
--   une carte sans son dossier (donc sans autrice à créditer) le jour où une
--   copie serait ratée.
--
-- LE CRÉDIT EST UNE COLONNE, PAS UNE DÉDUCTION. `artist_name` est saisi par la
--   proposante : son pseudo de compte n'est pas forcément sa signature
--   d'artiste, et une carte doit créditer le nom sous lequel on veut être
--   reconnue. `artist_url` est facultatif et vérifié à l'écriture.
--
-- TROIS GARDE-FOUS, REPRIS DE LA PHOTO DE CARTE (docs/TCG.md § 2) :
--   1. la proposition VAUT déclaration d'originalité et accord de diffusion
--      (`licence_accepted_at`) — sans quoi on publierait le travail de
--      quelqu'un sans son accord ;
--   2. rien n'est visible avant MODÉRATION (`status = 'pending'`) : le bucket
--      est public, une image non relue ne doit pas y être annoncée ;
--   3. le retrait est possible (`status = 'revoked'`) et RÉTROACTIF : les
--      lecteurs publics filtrent sur `status = 'approved'`, et une carte déjà
--      tirée retombe sur une face neutre au lieu d'afficher l'image retirée.
--
-- LA CARTE NE SE SUPPRIME PAS QUAND L'ŒUVRE EST RETIRÉE. `tcg_pack_cards`
--   référence la fan art en ON DELETE RESTRICT : effacer l'œuvre effacerait des
--   cartes possédées, c'est-à-dire des collections. On retire (`revoked`), on
--   ne détruit pas.
--
-- ⚠️ DEUX CHECK SUR `tcg_pack_cards`, ET LES DEUX SONT RECOPIÉS EN ENTIER :
--   `tcg_pack_cards_subject_kind_check` ET `tcg_pack_cards_subject_exclusif`.
--   Énumérés sur la base réelle le 2026-09-16 (trois sujets : player, team,
--   map). Élargir l'un sans l'autre est l'erreur qui a coûté 58 paquets le
--   2026-09-14 — cf. `utils/tcg/earnSources.ts`.
--
-- CAVEATS:
--   - Additive et idempotente. RLS activée, service role uniquement.
--   - `card_fanart_id` est NULLABLE : les cartes existantes ne bougent pas.
--   - Rollback : retirer la valeur 'fanart' des deux CHECK APRÈS avoir
--     requalifié les cartes concernées, puis DROP la colonne et la table.
--   - APPLIQUÉE en production le 2026-09-16.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tcg_fanart_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  -- Qui a proposé. Pas de clé étrangère vers auth.users (même choix que
  -- `tcg_wallet_entries.user_id`) : supprimer un compte ne doit pas faire
  -- disparaître une carte que d'autres possèdent.
  submitted_by uuid NOT NULL,

  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 80),
  -- Le nom à CRÉDITER, tel que l'autrice veut être nommée.
  artist_name text NOT NULL CHECK (char_length(artist_name) BETWEEN 2 AND 80),
  artist_url text CHECK (artist_url IS NULL OR char_length(artist_url) <= 300),
  -- Chemin dans le bucket public `teams-images`, préfixe `tcg-fanart/`.
  image_path text NOT NULL CHECK (char_length(image_path) BETWEEN 3 AND 300),

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
  -- Rareté décidée à la validation. Nulle tant que la carte n'est pas approuvée.
  rarity text CHECK (rarity IS NULL OR rarity IN ('common', 'rare', 'epic', 'legendary')),

  -- La proposition vaut déclaration d'originalité ET accord de diffusion.
  licence_accepted_at timestamptz NOT NULL,
  review_notes text CHECK (review_notes IS NULL OR char_length(review_notes) <= 500),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Une carte approuvée a forcément une rareté : sans elle, le tirage ne
  -- saurait pas quoi écrire sur `tcg_pack_cards.rarity`.
  CONSTRAINT tcg_fanart_approved_has_rarity CHECK (
    status <> 'approved' OR rarity IS NOT NULL
  )
);

-- Le vivier du tirage et la page des crédits : les approuvées d'un espace.
CREATE INDEX IF NOT EXISTS idx_tcg_fanart_approved
  ON public.tcg_fanart_cards (tenant_id, created_at DESC)
  WHERE status = 'approved';

-- La file de modération, la plus ancienne d'abord.
CREATE INDEX IF NOT EXISTS idx_tcg_fanart_pending
  ON public.tcg_fanart_cards (tenant_id, created_at)
  WHERE status = 'pending';

-- « Mes propositions », et le plafond de propositions en attente.
CREATE INDEX IF NOT EXISTS idx_tcg_fanart_author
  ON public.tcg_fanart_cards (tenant_id, submitted_by, created_at DESC);

ALTER TABLE public.tcg_fanart_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tcg_fanart_cards_service_role ON public.tcg_fanart_cards;
CREATE POLICY tcg_fanart_cards_service_role ON public.tcg_fanart_cards
  FOR ALL TO service_role USING (true) WITH CHECK (true);

/* ---------------------------------------------------------------------------
 * `tcg_pack_cards` accueille un quatrième sujet
 * ------------------------------------------------------------------------- */

ALTER TABLE public.tcg_pack_cards
  ADD COLUMN IF NOT EXISTS card_fanart_id uuid
    REFERENCES public.tcg_fanart_cards(id) ON DELETE RESTRICT;

ALTER TABLE public.tcg_pack_cards
  DROP CONSTRAINT IF EXISTS tcg_pack_cards_subject_kind_check;
ALTER TABLE public.tcg_pack_cards
  ADD CONSTRAINT tcg_pack_cards_subject_kind_check
  CHECK (subject_kind IN ('player', 'team', 'map', 'fanart'));

ALTER TABLE public.tcg_pack_cards
  DROP CONSTRAINT IF EXISTS tcg_pack_cards_subject_exclusif;
ALTER TABLE public.tcg_pack_cards
  ADD CONSTRAINT tcg_pack_cards_subject_exclusif
  CHECK (
    (subject_kind = 'player' AND card_user_id IS NOT NULL AND card_team_id IS NULL AND card_map_slug IS NULL AND card_fanart_id IS NULL)
    OR (subject_kind = 'team' AND card_team_id IS NOT NULL AND card_user_id IS NULL AND card_map_slug IS NULL AND card_fanart_id IS NULL)
    OR (subject_kind = 'map' AND card_map_slug IS NOT NULL AND card_user_id IS NULL AND card_team_id IS NULL AND card_fanart_id IS NULL)
    OR (subject_kind = 'fanart' AND card_fanart_id IS NOT NULL AND card_user_id IS NULL AND card_team_id IS NULL AND card_map_slug IS NULL)
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
