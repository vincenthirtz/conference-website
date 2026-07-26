-- Migration: Nouvelle audience de campagne email « inscrit·es au tournoi jamais connecté·es »
-- Date: 2026-07-26
--
-- Segment de RELANCE : les membres des équipes inscrites au tournoi EN COURS
-- (résolu par utils/currentTournament.ts → tournament_teams → team_members) dont
-- le compte auth existe, est confirmé, mais n'a JAMAIS servi à ouvrir une session
-- (auth.users.last_sign_in_at IS NULL). Résolution applicative dans
-- utils/broadcasts.ts::computeAudienceRecipients (aucune structure DB nouvelle).
--
-- Seul changement de schéma : ouvrir le CHECK email_campaigns.audience à la
-- nouvelle valeur. On rejoue la liste complète (même nom de contrainte que
-- open_email_audience_and_broadcast_optouts.sql / add_newsletter_subscribers.sql),
-- de façon idempotente.

ALTER TABLE email_campaigns DROP CONSTRAINT IF EXISTS email_campaigns_audience_allowed;
ALTER TABLE email_campaigns ADD CONSTRAINT email_campaigns_audience_allowed
  CHECK (audience IN (
    'all-confirmed-users',
    'team-captains',
    'team-members',
    'staff',
    'adherents',
    'tournament-never-logged-in',
    'newsletter',
    'all-plus-newsletter',
    'adherents-plus-newsletter'
  ));
