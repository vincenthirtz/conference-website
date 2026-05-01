-- Migration: Broadcast email campaigns — wave scheduling
-- Date: 2026-05-01
--
-- Tables pour planifier l'envoi d'une campagne email broadcast par vagues
-- (ex. 10 emails / jour) afin de rester sous le quota Brevo (300/jour gratuit)
-- ou simplement étaler la charge.
--
-- broadcast_recipients : snapshot figé des destinataires au moment de la
--   planification, avec un statut par destinataire (pending/sent/failed).
--   Le snapshot évite de double-envoyer si la liste auth.users évolue.
--
-- broadcast_schedules : config de cadence par campagne (1 ligne max par
--   campaign_id). Le cron quotidien lit cette table pour décider quoi envoyer.

CREATE TABLE IF NOT EXISTS broadcast_recipients (
  campaign_id text NOT NULL,
  user_id uuid NOT NULL,
  email text NOT NULL,
  label text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, user_id)
);

-- Index partiel pour le cron : "prochains pending d'une campagne"
CREATE INDEX IF NOT EXISTS broadcast_recipients_pending_idx
  ON broadcast_recipients (campaign_id, created_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS broadcast_schedules (
  campaign_id text PRIMARY KEY,
  wave_size int NOT NULL DEFAULT 10
    CHECK (wave_size > 0 AND wave_size <= 290),
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'paused', 'completed')),
  last_wave_at timestamptz,
  total_recipients int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index pour le cron : "campagnes éligibles à une nouvelle vague"
CREATE INDEX IF NOT EXISTS broadcast_schedules_active_idx
  ON broadcast_schedules (last_wave_at)
  WHERE status = 'scheduled';

COMMENT ON TABLE broadcast_recipients IS
  'Queue figée des destinataires d''une campagne broadcast — un par utilisateur et par campagne.';
COMMENT ON COLUMN broadcast_recipients.status IS
  'pending = pas encore envoyé ; sent = succès Brevo ; failed = échec définitif (voir error).';
COMMENT ON TABLE broadcast_schedules IS
  'Cadence d''envoi par vague pour les campagnes broadcast — une ligne au maximum par campaign_id.';
COMMENT ON COLUMN broadcast_schedules.wave_size IS
  'Nombre d''emails envoyés par vague (cron quotidien). Borné à 290 pour rester sous Brevo gratuit.';
COMMENT ON COLUMN broadcast_schedules.status IS
  'scheduled = vague à venir ; paused = stoppée par admin ; completed = plus de pending.';
