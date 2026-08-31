-- Migration: add_campaign_audiences_team_leadership.sql
-- Date: 2026-08-31
--
-- WHY:
--   Le segment « Capitaines d'équipe » ne lit que `teams.captain_id`. Les
--   MANAGERS — 7 personnes sur 5 équipes aujourd'hui — n'étaient donc joignables
--   par aucune audience, alors que ce sont eux qui tiennent le roster au
--   quotidien. Pire : une équipe créée « en tant que manager » a `captain_id`
--   NULL tant que la capitaine désignée n'a pas accepté ; elle n'avait aucun
--   destinataire du tout, sans que rien ne le signale.
--
--   Les coachs (7 personnes) étaient dans le même angle mort.
--
-- WHAT:
--   Deux valeurs de plus dans la liste blanche de `email_campaigns.audience` :
--
--     - `team-captains-managers` : capitaines + managers, c'est-à-dire qui
--       PILOTE une équipe. Deux sources, parce que le capitanat vit dans
--       `teams.captain_id` et le managérat dans `team_members.role`.
--     - `team-staff` : l'encadrement complet — capitaine + managers + coachs.
--
--   Le calcul vit côté application (`utils/broadcasts.ts`).
--
-- CAVEATS:
--   - `team-staff` ≠ `staff`. Le second désigne le staff DU SITE
--     (owner/admin/caster), le premier l'encadrement d'UNE ÉQUIPE. Deux
--     dimensions distinctes qui portent le même mot ; les libellés de l'admin
--     disent « Encadrement d'équipe » pour cette raison.
--   - La contrainte est REMPLACÉE, pas étendue : Postgres ne sait pas ajouter
--     une valeur à un CHECK. La liste doit rester le miroir exact du type
--     `CampaignAudience` (utils/broadcasts.ts) et de l'enum zod
--     (utils/campaignSchema.ts) — trois endroits à garder en phase.
--   - Idempotente : DROP ... IF EXISTS puis ADD.
--   - Rollback : rejouer l'ADD sans les deux nouvelles valeurs (aucune campagne
--     ne doit alors les porter, sinon la contrainte est refusée).

BEGIN;

ALTER TABLE public.email_campaigns
  DROP CONSTRAINT IF EXISTS email_campaigns_audience_allowed;

ALTER TABLE public.email_campaigns
  ADD CONSTRAINT email_campaigns_audience_allowed CHECK (
    audience = ANY (
      ARRAY[
        'all-confirmed-users'::text,
        'team-captains'::text,
        'team-captains-managers'::text,
        'team-staff'::text,
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
