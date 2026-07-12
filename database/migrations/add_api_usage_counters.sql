-- Migration: compteurs d'usage API durables (quota par plan + rate-limit partagé)
-- Date: 2026-07-13
--
-- WHY:
--   Le rate-limit actuel (`utils/rateLimit.ts`) est en mémoire, PAR PROCESS :
--   sur Netlify (multi-instances, pas de Redis) chaque instance a son propre
--   compteur → la limite réelle = N × la limite voulue. Pour la surface API
--   AUTHENTIFIÉE (écritures REST `/api/public/v1/*` + mutations GraphQL, qui
--   portent un tenant + un plan) on veut :
--     - un rate-limit/min PARTAGÉ entre instances,
--     - un QUOTA MENSUEL numérique par plan (levier commercial « Régie
--       solidaire »).
--   Faible volume (peu d'appels authentifiés) → une écriture DB par requête est
--   acceptable. Les lectures anonymes /api/public/v1/* gardent le limiteur
--   in-memory par IP (gros volume, abus grossier géré au bord).
--
-- WHAT:
--   - Table `api_usage_counters(tenant_id, window_kind, window_key, count)` :
--     un compteur fixed-window par (tenant, fenêtre). `window_kind` = 'minute'
--     ou 'month' ; `window_key` = clé UTC ('YYYYMMDDHHMM' ou 'YYYYMM').
--   - Fonction `consume_api_usage(tenant, minute_key, month_key)` : incrémente
--     ATOMIQUEMENT les deux fenêtres (INSERT … ON CONFLICT DO UPDATE … +1) et
--     renvoie les deux counts. 1 aller-retour DB par requête authentifiée.
--   - RLS enabled, AUCUNE policy => service_role only (le site incrémente via
--     supabaseAdmin ; jamais exposé au client).
--
-- CAVEATS:
--   - Idempotente : IF NOT EXISTS + CREATE OR REPLACE FUNCTION.
--   - Les lignes 'minute' s'accumulent (1 ligne / tenant / minute active). Volume
--     négligeable au débit authentifié attendu ; une purge (DELETE WHERE
--     updated_at < now()-2 days AND window_kind='minute') pourra être ajoutée en
--     cron plus tard si besoin.
--   - Le compteur incrémente AVANT le check applicatif : une requête rejetée
--     compte quand même (fixed-window classique, dissuasion légère).

BEGIN;

CREATE TABLE IF NOT EXISTS public.api_usage_counters (
  tenant_id   uuid NOT NULL,
  window_kind text NOT NULL,
  window_key  text NOT NULL,
  count       integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, window_kind, window_key),
  CONSTRAINT api_usage_counters_window_kind_chk
    CHECK (window_kind IN ('minute', 'month'))
);

COMMENT ON TABLE public.api_usage_counters IS
  'Compteurs fixed-window d''usage API authentifiée par tenant (quota mensuel + rate-limit/min partagé). service_role uniquement.';

CREATE INDEX IF NOT EXISTS idx_api_usage_counters_updated_at
  ON public.api_usage_counters (updated_at);

ALTER TABLE public.api_usage_counters ENABLE ROW LEVEL SECURITY;
-- Aucune policy : tout passe par supabaseAdmin (service_role bypass RLS).

-- Incrément atomique des deux fenêtres, renvoie les counts courants.
CREATE OR REPLACE FUNCTION public.consume_api_usage(
  p_tenant_id uuid,
  p_minute_key text,
  p_month_key text
)
RETURNS TABLE (minute_count integer, month_count integer)
LANGUAGE plpgsql
AS $$
DECLARE
  v_minute integer;
  v_month integer;
BEGIN
  INSERT INTO public.api_usage_counters (tenant_id, window_kind, window_key, count, updated_at)
  VALUES (p_tenant_id, 'minute', p_minute_key, 1, now())
  ON CONFLICT (tenant_id, window_kind, window_key)
  DO UPDATE SET count = api_usage_counters.count + 1, updated_at = now()
  RETURNING count INTO v_minute;

  INSERT INTO public.api_usage_counters (tenant_id, window_kind, window_key, count, updated_at)
  VALUES (p_tenant_id, 'month', p_month_key, 1, now())
  ON CONFLICT (tenant_id, window_kind, window_key)
  DO UPDATE SET count = api_usage_counters.count + 1, updated_at = now()
  RETURNING count INTO v_month;

  RETURN QUERY SELECT v_minute, v_month;
END;
$$;

COMMENT ON FUNCTION public.consume_api_usage(uuid, text, text) IS
  'Incrémente atomiquement les compteurs minute+month d''un tenant et renvoie les deux counts. Appelé par utils/billing/apiQuota.ts via supabaseAdmin.';

COMMIT;

-- PostgREST : reload du cache de schéma pour exposer la nouvelle table + RPC.
NOTIFY pgrst, 'reload schema';
