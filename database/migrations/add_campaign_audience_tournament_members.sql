-- Migration: add_campaign_audience_tournament_members.sql
-- Date: 2026-09-09
--
-- WHY:
--   Annoncer le calendrier de la Cup 2026 suppose d'écrire à tout le monde qui
--   la joue : joueuses titulaires, remplaçantes et encadrement des équipes
--   inscrites. Aucun segment ne savait viser ça.
--
--   `team-members` en est proche mais ratisse les `team_members` de TOUTES les
--   éditions : au 2026-09-09, 68 personnes, dont 8 ne sont sur aucune équipe
--   inscrite en 2026. Elles auraient reçu le calendrier d'un tournoi auquel
--   elles ne participent pas. `team-staff` et `team-captains-managers`, eux,
--   filtrent par rôle et laissent les joueuses de côté.
--
-- WHAT:
--   Ajoute `tournament-members` à la liste blanche de
--   `email_campaigns.audience`. Le calcul des destinataires vit côté
--   application (`utils/broadcasts.ts` → `listCurrentTournamentMemberIds`) :
--   tous les `team_members` des équipes présentes dans `tournament_teams` pour
--   le tournoi résolu par `resolveCurrentTournamentId`, SANS filtre de rôle.
--   Hors période de tournoi, l'ensemble est vide et la campagne ne part à
--   personne — comportement voulu.
--
-- CAVEATS:
--   - La contrainte est REMPLACÉE, pas étendue : Postgres ne sait pas ajouter
--     une valeur à un CHECK existant. La liste ci-dessous doit rester le
--     miroir exact du type `CampaignAudience` (utils/broadcasts.ts) et de
--     l'enum zod (utils/campaignSchema.ts) — trois endroits à garder en phase.
--   - La liste est reprise de la contrainte VIVANTE, pas de la migration
--     précédente : `add_campaign_audience_without_battletag.sql` omettait
--     `team-captains-managers` et `team-staff`, réintroduits depuis par
--     `add_campaign_audiences_team_leadership.sql`. Repartir du fichier le plus
--     récent aurait silencieusement supprimé ces deux audiences.
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
        'team-captains-managers'::text,
        'team-staff'::text,
        'team-members'::text,
        'staff'::text,
        'adherents'::text,
        'tournament-members'::text,
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
