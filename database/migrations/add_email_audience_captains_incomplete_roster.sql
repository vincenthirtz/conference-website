-- Migration: Nouvelle audience de campagne email « capitaines — roster incomplet »
-- Date: 2026-07-26
--
-- Segment de RELANCE : les capitaines des équipes inscrites au tournoi EN COURS
-- dont le roster compte moins de `tournaments.min_players` TITULAIRES
-- (team_members avec is_substitute distinct de true ; les équipes sans membre
-- sont incluses). Résolution applicative dans utils/broadcasts.ts::
-- computeAudienceRecipients → listIncompleteRosterCaptainIds. Aucune structure
-- DB nouvelle ; si le tournoi ne déclare pas de min_players, l'audience est vide.
--
-- Seul changement de schéma : ouvrir le CHECK email_campaigns.audience à la
-- nouvelle valeur. On rejoue la liste complète (même nom de contrainte que
-- add_email_audience_tournament_never_logged_in.sql), de façon idempotente.

ALTER TABLE email_campaigns DROP CONSTRAINT IF EXISTS email_campaigns_audience_allowed;
ALTER TABLE email_campaigns ADD CONSTRAINT email_campaigns_audience_allowed
  CHECK (audience IN (
    'all-confirmed-users',
    'team-captains',
    'team-members',
    'staff',
    'adherents',
    'tournament-never-logged-in',
    'tournament-captains-incomplete-roster',
    'newsletter',
    'all-plus-newsletter',
    'adherents-plus-newsletter'
  ));
