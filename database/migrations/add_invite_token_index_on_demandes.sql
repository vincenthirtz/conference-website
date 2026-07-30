-- Migration: add_invite_token_index_on_demandes.sql
-- Date: 2026-07-31
--
-- WHY:
--   Le « lien privé » d'invitation d'équipe (cf. utils/teams/inviteLinks.ts)
--   est résolu par le SHA-256 du jeton, stocké dans
--   `demandes.payload->>'invite_token_hash'`. Sans index, chaque ouverture de
--   lien fait un seq scan sur `demandes` (table qui grossit avec toutes les
--   demandes : join, transfert, invite…).
--
--   Index d'EXPRESSION partiel (uniquement les lignes type='invite' qui portent
--   un jeton) : petit, et exactement aligné sur la requête
--   `.eq('type','invite').eq("payload->>invite_token_hash", …)`.
--
--   Pas de colonne dédiée : le jeton est un attribut d'invitation parmi
--   d'autres, il vit avec le reste du payload (desired_role, battle_tag,
--   set_captain…), et aucune contrainte relationnelle ne s'y rattache.
--
--   L'index est aussi UNIQUE : deux invitations ne peuvent pas partager le même
--   jeton (collision impossible en pratique sur 32 octets, mais on rend
--   l'invariant explicite plutôt que probabiliste).

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS demandes_invite_token_hash_idx
  ON public.demandes ((payload ->> 'invite_token_hash'))
  WHERE type = 'invite' AND payload ? 'invite_token_hash';

COMMENT ON INDEX public.demandes_invite_token_hash_idx IS
  'Résolution du lien privé d''invitation (SHA-256 du jeton). Partiel sur les '
  'demandes type=invite portant un jeton ; unique pour interdire deux '
  'invitations avec le même jeton.';

COMMIT;
