-- Migration: add_tcg_team_card_image.sql
-- Date: 2026-09-14
--
-- WHY:
--   La carte TCG d'une équipe se composait jusqu'ici de son nom et de son logo
--   (`teams.logo_url`), au motif que ces deux données sont déjà publiques et
--   qu'une équipe n'a donc aucun consentement à donner — contrairement à la
--   photo d'une joueuse (`tcg_player_cards`, cf. docs/TCG.md §2.4).
--
--   Ce raisonnement tient sur la vie privée, mais pas sur le rendu : un logo
--   est une marque, pas une illustration. Cadré dans un format 3/4, il flotte
--   au centre d'un aplat (`object-contain p-4` dans components/tcg/TcgCard.tsx)
--   là où les cartes joueuses et maps remplissent leur cadre. Les capitaines
--   veulent pouvoir poser un vrai visuel.
--
-- WHAT:
--   Une colonne sur `teams` : le CHEMIN de l'image dans le bucket public
--   `teams-images`, jamais son URL.
--
--   Pourquoi un chemin alors que `teams.logo_url` voisine stocke une URL : une
--   URL ne permet pas de supprimer le fichier qu'elle désigne. Or cette image-ci
--   est remplaçable et retirable, et chaque remplacement doit effacer le fichier
--   précédent — sans quoi le bucket accumule des orphelins que plus rien ne
--   référence. C'est la convention déjà retenue par `tcg_player_cards
--   .photo_path`, et c'est celle qui compte ici.
--
-- PAS DE MODÉRATION, volontairement :
--   Le dépôt est immédiatement visible. Une équipe engage sa propre vitrine, sa
--   capitaine est identifiée, et le staff peut corriger après coup (il porte la
--   permission sur toutes les équipes via `hasTeamPermission`). Une file
--   d'attente comme celle des photos de joueuses répondrait à un risque qui
--   n'existe pas ici — la photo d'une joueuse expose une PERSONNE, et c'est
--   cela, et non l'image en soi, qui justifie une relecture.
--
-- CAVEATS:
--   - Pas de RLS à ajouter : `teams` a déjà la sienne. La colonne est lue par
--     le même chemin que `logo_url` (lecture publique de l'équipe) et n'est
--     écrite que par `/api/teams/[teamId]/tcg-image`, en service_role.
--   - Pas de FK, pas de nouvelle table : aucun reload du schema cache PostgREST
--     n'est nécessaire.
--   - Idempotente : IF NOT EXISTS.
--   - Rollback : ALTER TABLE public.teams DROP COLUMN tcg_image_path;
--     (les fichiers déjà déposés resteraient dans le bucket).

BEGIN;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS tcg_image_path text;

COMMENT ON COLUMN public.teams.tcg_image_path IS
  'Chemin (pas URL) dans le bucket public teams-images de l''illustration de la carte TCG de l''équipe. NULL = la carte retombe sur logo_url. Écrit uniquement par /api/teams/[teamId]/tcg-image.';

COMMIT;
