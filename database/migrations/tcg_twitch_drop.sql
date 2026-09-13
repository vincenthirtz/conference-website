-- Migration: rendre le drop TCG en direct EXPLOITABLE.
-- Date: 2026-09-13
--
-- WHY:
--   Le webhook EventSub (`pages/api/webhooks/twitch/tcg-drop.ts`) est livré,
--   signé et testé — mais inexploitable, pour deux raisons indépendantes que
--   cette migration lève ensemble.
--
-- 1) ON NE SAIT PAS À QUI DONNER.
--   Un événement Twitch livre un `user_id` Twitch. Rien, dans ce dépôt, ne le
--   traduit en `auth.users.id`. Il existe `user_discord_links` et
--   `user_battlenet_links` ; il n'existait rien pour Twitch, et Twitch n'est
--   pas un fournisseur de connexion du site.
--
--   `team_members.twitch` NE CONVIENT PAS, et c'est le point important : ce
--   champ est saisi librement par la joueuse ou sa capitaine, sans aucune
--   vérification. S'en servir comme identité laisserait n'importe qui inscrire
--   le pseudo d'une autre et encaisser ses drops. Une identité qui décide d'un
--   gain doit être PROUVÉE, pas déclarée.
--
--   D'où une table dédiée, calquée sur `add_user_discord_links.sql` : même
--   forme, même contrainte d'unicité, mêmes garanties.
--
-- 2) LE REGISTRE REFUSE L'ORIGINE.
--   `tcg_wallet_entries_source_kind_check` n'admet pas `twitch_drop`. Le
--   registre des sources (`utils/tcg/earnSources.ts`) le sait et l'encode par
--   `schemaReady: false` : la route s'allumera d'elle-même une fois ce drapeau
--   basculé, sans être modifiée.
--
-- POURQUOI `twitch_user_id` EST DU TEXTE ET NON UN ENTIER : Twitch documente
--   ses identifiants comme des chaînes de chiffres, et leur longueur n'est pas
--   garantie dans le temps. Les stocker en texte évite une conversion qui
--   déborderait un jour en silence — même choix que `discord_user_id`.
--
-- POURQUOI `twitch_login` EXISTE MALGRÉ SON INSTABILITÉ : un pseudo Twitch se
--   renomme, l'identifiant non. Le login n'est là que pour l'affichage et le
--   diagnostic ; RIEN ne doit s'y appuyer pour décider d'un gain.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS, et qu'il faut savoir : elle crée la
--   table, elle ne la REMPLIT pas. Tant qu'un flux OAuth Twitch côté joueuse
--   n'existe pas, la table reste vide et le webhook continuera de répondre
--   `identity_not_linked`. C'est un prérequis levé, pas la fonctionnalité
--   terminée.
--
-- CAVEATS:
--   - Idempotente : IF NOT EXISTS / DROP CONSTRAINT IF EXISTS.
--   - Purement ADDITIVE : une table neuve, un CHECK ÉLARGI. Élargir une
--     contrainte ne peut invalider aucune ligne existante.
--   - RLS activée SANS policy : comme les deux autres tables de liaison, rien
--     n'est lu par le client en direct — tout passe par les routes serveur.

/* ---------------------------------------------------------------------------
 * 1) Le pont identité : compte Twitch → compte du site
 * ------------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS public.user_twitch_links (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identifiant numérique Twitch, STABLE dans le temps. UNIQUE : un compte
  -- Twitch ne peut pas alimenter deux comptes du site (même garde anti-smurf
  -- que `user_battlenet_links`).
  twitch_user_id text NOT NULL UNIQUE,

  -- Affichage et diagnostic SEULEMENT — un pseudo se renomme.
  twitch_login text,

  linked_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_twitch_links IS
  'Pont entre un compte Twitch et un compte du site, pour attribuer un drop TCG en direct. L''identité doit être PROUVÉE par OAuth : team_members.twitch est auto-déclaré et ne convient pas.';

ALTER TABLE public.user_twitch_links ENABLE ROW LEVEL SECURITY;

/* ---------------------------------------------------------------------------
 * 2) Le registre accepte l'origine « drop »
 * ------------------------------------------------------------------------- */

ALTER TABLE public.tcg_wallet_entries
  DROP CONSTRAINT IF EXISTS tcg_wallet_entries_source_kind_check;

ALTER TABLE public.tcg_wallet_entries
  ADD CONSTRAINT tcg_wallet_entries_source_kind_check
  CHECK (
    source_kind IN (
      'match_win',
      'scrim_win',
      'booster_purchase',
      'admin_grant',
      'card_recycled',
      -- Drop réclamé pendant un live. `source_ref` porte le DIRECT
      -- (`<broadcaster>:<startedAt>`), pas l'échange : l'unicité du registre
      -- réalise ainsi « un drop par live et par personne », sans compteur.
      'twitch_drop'
    )
  );
