-- Migration : association vérifiée via HelloAsso → Découverte offerte.
-- Date: 2026-09-16
--
-- WHY. Le concurrent analysé le 15/09 offre son palier d'entrée aux
--   associations vérifiées sur HelloAsso. Chez nous, la même petite association
--   paie 100 €/an pour Découverte — un palier qui n'a même pas le bot Discord.
--   C'est le point de prix le plus exposé de la grille (lot 1 du rapport).
--
-- CE QUI TIENT LIEU DE VÉRIFICATION, et pourquoi il n'y a pas de formulaire :
--   HelloAsso n'ouvre de compte qu'à des organismes à but non lucratif. Un
--   espace qui relie SES identifiants API HelloAsso (déjà nécessaire depuis le
--   correctif Q036 pour encaisser ses propres cagnottes) prouve donc, par un
--   appel qui réussit, qu'une association existe derrière lui. On estampille ce
--   moment plutôt que de demander un numéro RNA que personne n'irait contrôler.
--
-- CE QUE LA COLONNE N'EST PAS : un plan. Le plan reste dans `plan`. Ceci dit
--   seulement « une association a été vérifiée le … », ce qui rend la Découverte
--   non facturable pour cet espace (ni expiration, ni relance de paiement, cf.
--   utils/billing/nonprofitGrant.ts). Un espace vérifié qui CHOISIT Régie ou
--   Circuit paie son plan comme tout le monde : la gratuité porte sur l'entrée
--   de gamme, pas sur le catalogue.
--
-- CAVEATS:
--   - Additive et idempotente. Aucune valeur rétroactive : les espaces déjà
--     reliés seront estampillés à leur prochain enregistrement d'identifiants
--     (ou à la main, requête en commentaire plus bas).
--   - L'estampille est RETIRÉE quand l'espace délie son compte HelloAsso : la
--     preuve disparaît avec le compte qui la portait.
--   - Rollback : ALTER TABLE public.tenants DROP COLUMN nonprofit_verified_at,
--     DROP COLUMN nonprofit_org_name.
--   - APPLIQUÉE en production le 2026-09-16, instantané de schéma régénéré.

BEGIN;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS nonprofit_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS nonprofit_org_name text;

COMMENT ON COLUMN public.tenants.nonprofit_verified_at IS
  'Date à laquelle des identifiants HelloAsso valides ont été reliés (preuve de structure à but non lucratif). NULL = non vérifié. Rend le palier Découverte non facturable pour cet espace.';

COMMENT ON COLUMN public.tenants.nonprofit_org_name IS
  'Nom de l''organisation tel que HelloAsso l''a renvoyé lors de la vérification. Affiché en clair dans l''écran de facturation.';

-- Rattraper un espace déjà relié, à la main (aucune automatisation rétroactive
-- : on ne veut pas estampiller sans qu'un appel HelloAsso ait réussi) :
--   UPDATE public.tenants SET nonprofit_verified_at = now()
--    WHERE id = '<tenant>' AND nonprofit_verified_at IS NULL;

COMMIT;
