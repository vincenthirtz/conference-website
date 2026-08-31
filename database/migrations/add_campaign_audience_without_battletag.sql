-- Migration: add_campaign_audience_without_battletag.sql
-- Date: 2026-08-31
--
-- WHY:
--   Six fiches de roster JOUANTES n'ont aucun BattleTag. Sans lui, personne ne
--   peut identifier ces joueuses en jeu, elles ne comptent pas au classement,
--   et la vérification Battle.net n'a rien à comparer. Les relancer suppose de
--   pouvoir les cibler : les segments existants ne savent viser que « tous les
--   membres d'équipe », ce qui reviendrait à écrire à une vingtaine de
--   personnes pour en concerner six.
--
--   Le segment jumeau `team-members-without-discord` existe déjà et traite
--   exactement le même genre de manque. On suit sa forme.
--
-- WHAT:
--   Ajoute `team-members-without-battletag` à la liste blanche de
--   `email_campaigns.audience`. Le calcul des destinataires vit côté
--   application (`utils/broadcasts.ts` →
--   `listTeamMembersWithoutBattleTagIds`), qui exclut l'encadrement : un coach
--   ou une manager n'a jamais eu à fournir de BattleTag (roleRequiresBattleTag).
--
-- CAVEATS:
--   - La contrainte est REMPLACÉE, pas étendue : Postgres ne sait pas ajouter
--     une valeur à un CHECK existant. La liste ci-dessous doit donc rester le
--     miroir exact du type `CampaignAudience` (utils/broadcasts.ts) et de
--     l'enum zod (utils/campaignSchema.ts) — trois endroits à garder en phase.
--   - Idempotente : DROP ... IF EXISTS puis ADD.
--   - Pas de reload PostgREST : aucune FK ni colonne touchée.
--   - Rollback : rejouer l'ADD sans la nouvelle valeur (aucune campagne ne doit
--     alors la porter, sinon la contrainte est refusée).

BEGIN;

ALTER TABLE public.email_campaigns
  DROP CONSTRAINT IF EXISTS email_campaigns_audience_allowed;

ALTER TABLE public.email_campaigns
  ADD CONSTRAINT email_campaigns_audience_allowed CHECK (
    audience = ANY (
      ARRAY[
        'all-confirmed-users'::text,
        'team-captains'::text,
        'team-members'::text,
        'staff'::text,
        'adherents'::text,
        'tournament-never-logged-in'::text,
        'tournament-captains-incomplete-roster'::text,
        'team-members-without-discord'::text,
        'team-members-without-battletag'::text,
        'newsletter'::text,
        'all-plus-newsletter'::text,
        'adherents-plus-newsletter'::text
      ]
    )
  );

COMMIT;
