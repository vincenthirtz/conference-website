-- Migration: extend discord_webhooks.channel_type with support + MVP types
-- Date: 2026-04-28

DO $$
BEGIN
  ALTER TABLE discord_webhooks
    DROP CONSTRAINT IF EXISTS discord_webhooks_channel_type_check;

  ALTER TABLE discord_webhooks
    ADD CONSTRAINT discord_webhooks_channel_type_check
    CHECK (channel_type IN (
      'match_announcements',
      'match_results',
      'bracket_updates',
      'general_announcements',
      'veto_live',
      'checkin_reminders',
      'support_tickets',
      'mvp_polls'
    ));
END $$;
