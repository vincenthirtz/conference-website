-- Migration: Public support / safety reporting form for tournaments
-- Date: 2026-04-28
--
-- Permet a n'importe qui (joueuse, spectatrice, anonyme) de signaler un
-- litige, un comportement inapproprie, un probleme technique. Critical pour la
-- safety du tournoi feminin.

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid REFERENCES tournaments(id) ON DELETE SET NULL,
  reporter_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_name text,
  reporter_email text,
  is_anonymous boolean NOT NULL DEFAULT false,
  category text NOT NULL CHECK (category IN ('dispute', 'behavior', 'technical', 'other')),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  subject text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_note text,
  discord_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets (status);
CREATE INDEX IF NOT EXISTS support_tickets_severity_idx ON support_tickets (severity);
CREATE INDEX IF NOT EXISTS support_tickets_tournament_idx ON support_tickets (tournament_id);
CREATE INDEX IF NOT EXISTS support_tickets_created_at_idx ON support_tickets (created_at DESC);

COMMENT ON TABLE support_tickets IS 'Tickets de support / signalements (litiges, comportement, technique, autre).';
COMMENT ON COLUMN support_tickets.is_anonymous IS 'Si true, le signalement reste anonyme et aucun email de confirmation n''est envoye.';
COMMENT ON COLUMN support_tickets.severity IS 'low/medium/high. high declenche un ping immediat de la moderation sur Discord.';
COMMENT ON COLUMN support_tickets.discord_message_id IS 'ID du message Discord poste pour ce ticket (pour edition future eventuelle).';
