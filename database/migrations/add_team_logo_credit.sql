-- Migration : crédit d'artiste sur le logo d'une équipe.
-- Date: 2026-09-17
--
-- WHY:
--   Le logo d'une équipe est parfois l'œuvre d'une artiste (Team Positivité :
--   madamekuma). Il s'affiche en grand sur la fiche publique et, faute
--   d'illustration TCG dédiée, sur la carte à collectionner que d'autres
--   possèdent : le montrer sans nommer qui l'a dessiné, c'est exposer son
--   travail sans le lui rendre. Seules les cartes fan art avaient un crédit
--   (`tcg_fanart_cards.artist_name` / `artist_url`) ; rien n'existait pour un
--   logo.
--
--   Deux colonnes sur `teams` plutôt qu'une table : un logo a UN auteur, le
--   crédit vit et meurt avec le logo, et la fiche comme les faces TCG lisent
--   déjà `teams`.
--
-- RÈGLES (reprises à l'identique par `utils/teams/logoCredit.ts`, qui valide
-- côté route pour rendre une 400 lisible plutôt qu'une 500 de contrainte) :
--   - `logo_credit_name` : 2 à 80 caractères si renseigné. NULL = pas de crédit,
--     et le lien seul ne s'affiche jamais (un lien sans nom ne crédite personne).
--   - `logo_credit_url`  : 300 caractères max., et `https://` obligatoire. Un
--     `javascript:` ou un `data:` ferait d'un crédit public un vecteur
--     d'attaque ; un `http://` n'a aucune raison d'être pour un lien posé par
--     le staff.
--
-- CAVEATS:
--   - Additive et idempotente (ADD COLUMN IF NOT EXISTS, contraintes recréées).
--   - Aucune donnée posée ici : le crédit de Team Positivité est écrit à part.
--   - Pas de donnée personnelle au sens du registre RGPD : c'est un nom
--     d'artiste public choisi pour être affiché, rattaché à l'équipe et non à un
--     compte (aucune colonne `*_user_id`).
--   - Le changement de logo n'efface PAS le crédit : c'est au staff de le vider
--     en même temps (le formulaire d'édition d'équipe les montre côte à côte).
--   - Rollback : ALTER TABLE public.teams DROP COLUMN logo_credit_name,
--     DROP COLUMN logo_credit_url;

BEGIN;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS logo_credit_name text,
  ADD COLUMN IF NOT EXISTS logo_credit_url text;

ALTER TABLE public.teams
  DROP CONSTRAINT IF EXISTS teams_logo_credit_name_length;
ALTER TABLE public.teams
  ADD CONSTRAINT teams_logo_credit_name_length CHECK (
    logo_credit_name IS NULL
    OR char_length(logo_credit_name) BETWEEN 2 AND 80
  );

ALTER TABLE public.teams
  DROP CONSTRAINT IF EXISTS teams_logo_credit_url_https;
ALTER TABLE public.teams
  ADD CONSTRAINT teams_logo_credit_url_https CHECK (
    logo_credit_url IS NULL
    OR (
      char_length(logo_credit_url) <= 300
      AND logo_credit_url LIKE 'https://%'
    )
  );

COMMENT ON COLUMN public.teams.logo_credit_name IS
  'Nom de l''artiste du logo, affiché « Logo : <nom> » sur la fiche publique et sur la carte TCG quand elle montre le logo. NULL = pas de crédit.';

COMMENT ON COLUMN public.teams.logo_credit_url IS
  'Lien vers l''artiste du logo (https:// uniquement). Ignoré sans logo_credit_name.';

COMMIT;
