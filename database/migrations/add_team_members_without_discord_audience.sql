-- Migration: nouvelle audience de campagne « membres d'équipe sans Discord lié »
-- Date: 2026-08-23
--
-- WHY:
--   Le lien Discord (`user_discord_links`) conditionne tout l'outillage serveur :
--   rôle d'équipe, rôles Capitaine / Manager posés par role-sync, présence dans
--   le marché des joueuses libres. Une personne non liée en est privée SANS
--   jamais en être informée — relevé le 2026-08-23 : 10 comptes liés pour 31
--   membres d'équipe, et 1 seule capitaine liée sur 6.
--
--   Cette audience permet une relance ciblée depuis /admin/communications, avec
--   toute la mécanique existante (désinscription RGPD, vagues, suivi d'envoi).
--
-- CAVEATS:
--   - Les quatre points de synchronisation d'une audience doivent rester
--     alignés, sinon l'ajout est silencieusement inopérant :
--       1. ce CHECK,
--       2. `CampaignAudience` + le switch de `utils/broadcasts.ts`,
--       3. l'enum zod de `utils/campaignSchema.ts`,
--       4. les libellés + options de `components/admin/communications/CampaignsPanel.tsx`.
--     Sans (1), l'admin peut choisir l'audience et l'INSERT échoue en 500.
--   - Idempotente : le CHECK est recréé à l'identique augmenté d'une valeur.
--   - Aucune donnée touchée, aucun reload de schema cache nécessaire.

BEGIN;

ALTER TABLE public.email_campaigns
  DROP CONSTRAINT IF EXISTS email_campaigns_audience_allowed;

ALTER TABLE public.email_campaigns
  ADD CONSTRAINT email_campaigns_audience_allowed
  CHECK (
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
        'newsletter'::text,
        'all-plus-newsletter'::text,
        'adherents-plus-newsletter'::text
      ]
    )
  );

COMMIT;
