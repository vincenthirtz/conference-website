-- Migration: Badge API V2 — ack des notifs Web Push par device
-- Date: 2026-05-26
--
-- Contexte : la PWA staff pose un badge sur l'icône taskbar (Windows /
-- macOS / Android installé) via `navigator.setAppBadge(n)`. La V1 posait
-- juste un "dot" sans compteur. La V2 affiche le nombre de notifs non-lues
-- en lisant `data.unread_count` envoyé par le dispatcher dans le payload.
--
-- Schéma : on track l'ack au niveau (subscription, outbox_event) — un user
-- avec 2 devices a 2 rows par event. Ack sur device A = ack côté DB pour
-- TOUTES les subs de ce user (UX "j'ai vu, ça clear partout"). Le badge
-- de device B se mettra à jour au prochain push reçu — acceptable.
--
-- Idempotente : ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Pas de NOTIFY pgrst nécessaire (colonne ajoutée, pas de nouvelle FK).

ALTER TABLE public.web_push_deliveries
  ADD COLUMN IF NOT EXISTS acked_at TIMESTAMPTZ;

COMMENT ON COLUMN public.web_push_deliveries.acked_at IS
  'Timestamp où le staff a vu la notification (clic, ou ouverture de /admin/notifications). NULL = non-acked, compté dans le badge. Set par POST /api/admin/notifications/ack-all.';

-- Index partiel : la requête "unread count for user" filtre uniquement les
-- rows delivered ET non-acked. Index partiel pour minimiser la taille
-- (la majorité des rows finissent acked).
CREATE INDEX IF NOT EXISTS idx_web_push_deliveries_unacked
  ON public.web_push_deliveries (subscription_id)
  WHERE acked_at IS NULL AND status = 'delivered';
