-- Migration : langue de communication d'une équipe.
-- Date: 2026-09-20
--
-- WHY. Le 18/09/2026, Chocomates (équipe internationale) a été déclarée
--   forfait automatique à 19h00 faute de check-in : sa capitaine n'a pas de
--   Discord lié et n'a reçu que le mail de check-in — en français. Tous les
--   messages de check-in partaient en français, quelle que soit l'équipe.
--
-- CE QUE LA COLONNE PILOTE. Les messages ADRESSÉS À L'ÉQUIPE autour d'un
--   match : mails de check-in (ouverture, rappel, forfait, annulation), lien de
--   check-in (ouvert dans la langue), rappels Discord qui la mentionnent, MP du
--   bot. Pas l'interface du site : chaque personne y garde son propre choix.
--
-- NULL = langue par défaut de l'espace (français aujourd'hui). La liste est
--   fermée parce que chaque valeur doit avoir sa traduction réelle derrière :
--   accepter « de » sans texte allemand enverrait du français en le croyant
--   allemand.
--
-- CAVEATS:
--   - Additive et idempotente ; défaut NULL, rien ne change pour personne.
--   - Rollback : DROP COLUMN preferred_locale.
--   - APPLIQUÉE en production le 2026-09-20, instantané de schéma régénéré ;
--     Chocomates réglée sur 'en' le même jour à la demande du staff.

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS preferred_locale text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teams_preferred_locale_check'
  ) THEN
    ALTER TABLE public.teams
      ADD CONSTRAINT teams_preferred_locale_check
      CHECK (preferred_locale IS NULL OR preferred_locale IN ('fr', 'en'));
  END IF;
END $$;

COMMENT ON COLUMN public.teams.preferred_locale IS
  'Langue des messages adressés à l''équipe (check-in, rappels) : fr | en | NULL = défaut de l''espace.';
