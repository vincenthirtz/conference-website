-- Migration: scrim_plannings.reminder_pinged_at (idempotence du cron de relance)
-- Date: 2026-07-09
--
-- WHY:
--   Le cron `scrim-planning-reminders` relance les participants d'une grille
--   ouverte dont l'horizon approche et qui n'ont pas encore peint leurs
--   créneaux. Pour ne relancer qu'UNE fois par grille, on estampille
--   `reminder_pinged_at` après émission de l'event `scrim.planning.reminder`
--   (même pattern que `matches.escalation_pinged_at` pour dispute.sla_breached).
--
-- CAVEATS:
--   - Idempotente (ADD COLUMN IF NOT EXISTS). Pas de nouvelle FK → pas de reload
--     schema-cache requis, mais NOTIFY inoffensif conservé pour cohérence.

ALTER TABLE public.scrim_plannings
  ADD COLUMN IF NOT EXISTS reminder_pinged_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.scrim_plannings.reminder_pinged_at IS
  'Instant de la relance « dispos manquantes » (cron). NULL = pas encore relancée. Estampillé une seule fois par grille.';

NOTIFY pgrst, 'reload schema';
