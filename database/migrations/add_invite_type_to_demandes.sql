-- database/migrations/add_invite_type_to_demandes.sql
-- Adds 'invite' to the demandes type check constraint.
-- 'invite' rows are captain-initiated invitations to a player to join a team.
-- Convention :
--   user_id = invitee auth_user_id
--   team_id = team being joined
--   payload = { captain_auth_user_id, captain_discord_user_id,
--               invitee_discord_user_id, desired_role, battle_tag, expires_at }
-- Status flow : pending -> approved | rejected | cancelled.

ALTER TABLE demandes DROP CONSTRAINT IF EXISTS demandes_type_check;
ALTER TABLE demandes ADD CONSTRAINT demandes_type_check
  CHECK (type IN (
    'join',
    'leave',
    'captain_request',
    'team_registration',
    'transfer',
    'invite',
    'other'
  ));
