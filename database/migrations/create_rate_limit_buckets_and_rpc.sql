-- Migration: rate-limit durable (Tier 2) — table de compteurs + RPC atomique
-- Date: 2026-07-15
--
-- WHY: le rate-limiting historique vivait en mémoire process (par instance),
--   donc inefficace sur un déploiement multi-instances / serverless (Netlify)
--   où chaque invocation repart d'un compteur vierge. On persiste les compteurs
--   en base pour un quota partagé et durable entre toutes les instances. Le
--   décompte doit être ATOMIQUE (pas de read-then-write racé) : un INSERT ...
--   ON CONFLICT DO UPDATE ... RETURNING fait l'incrément et lit le total en une
--   seule instruction, sous verrou de ligne implicite.
--
-- WHAT:
--   - Table public.rate_limit_buckets : un compteur par (bucket, fenêtre). La
--     stratégie est une FENÊTRE FIXE (fixed window) : window_start est le début
--     de la fenêtre alignée sur p_window_seconds. Chaque bucket logique (ex.
--     "login:<ip>", "botkey:<tenant>") a une ligne par fenêtre active.
--   - RPC public.consume_rate_limit(p_bucket, p_window_seconds, p_max) : calcule
--     la fenêtre courante, incrémente atomiquement le compteur, et renvoie
--     true (autorisé) tant que hits <= p_max, false (bloqué) au-delà.
--
-- CONTRAT (consommé côté API — noms/signature FIGÉS) :
--   consume_rate_limit(p_bucket text, p_window_seconds int, p_max int)
--     RETURNS boolean.
--
-- RLS: ENABLE ROW LEVEL SECURITY sans AUCUNE policy => table invisible à anon /
--   authenticated. Accès exclusivement via service_role (supabaseAdmin) ou via
--   le RPC SECURITY DEFINER ci-dessous. Table d'infrastructure interne, jamais
--   exposée par PostgREST.
--
-- SECURITY DEFINER: le RPC s'exécute avec les droits du propriétaire pour
--   pouvoir écrire dans rate_limit_buckets malgré la RLS default-deny.
--   SET search_path = public pin le résolveur de noms (anti schema-hijacking,
--   cf. advisor 0011). EXECUTE réservé à service_role (le handler appelle via
--   supabaseAdmin.rpc(...)).
--
-- PURGE (NON appliquée ici volontairement): les vieilles fenêtres deviennent des
--   lignes mortes une fois expirées. Un job de purge périodique POURRAIT les
--   nettoyer, p.ex. via pg_cron :
--     -- SELECT cron.schedule('purge_rate_limit_buckets', '*/15 * * * *',
--     --   $$DELETE FROM public.rate_limit_buckets
--     --       WHERE window_start < now() - interval '1 day'$$);
--   On NE crée PAS de pg_cron dans cette migration (dépendance d'extension +
--   décision d'ops à part). La table reste correcte sans purge (les fenêtres
--   passées ne sont plus jamais touchées), la purge n'est qu'une hygiène.
--
-- CAVEATS:
--   - Idempotente : CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
--     REVOKE/GRANT rejouables, ENABLE RLS re-runnable.
--   - Pas de reload du cache PostgREST nécessaire (aucune FK ajoutée ; le RPC
--     est découvert au premier appel .rpc(...)).

BEGIN;

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  bucket       text        NOT NULL,
  window_start timestamptz NOT NULL,
  hits         int         NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

COMMENT ON TABLE public.rate_limit_buckets IS
  'Compteurs de rate-limit durables (fenêtre fixe). Une ligne par '
  '(bucket logique, fenêtre alignée sur window_start). RLS default-deny : '
  'accès service_role uniquement, via le RPC consume_rate_limit.';

-- RLS: default deny, aucune policy. Seul service_role / SECURITY DEFINER passe.
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_bucket         text,
  p_window_seconds int,
  p_max            int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w    timestamptz;
  cnt  int;
BEGIN
  -- Début de la fenêtre fixe courante, aligné sur p_window_seconds.
  w := to_timestamp(
         floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
       );

  -- Incrément atomique + lecture du total en une seule instruction.
  INSERT INTO public.rate_limit_buckets (bucket, window_start, hits)
  VALUES (p_bucket, w, 1)
  ON CONFLICT (bucket, window_start)
    DO UPDATE SET hits = rate_limit_buckets.hits + 1
  RETURNING hits INTO cnt;

  -- Autorisé tant qu'on ne dépasse pas le quota de la fenêtre.
  RETURN cnt <= p_max;
END;
$$;

COMMENT ON FUNCTION public.consume_rate_limit(text, int, int) IS
  'Consomme un jeton de rate-limit (fenêtre fixe). Incrémente atomiquement le '
  'compteur de (p_bucket, fenêtre courante alignée sur p_window_seconds) et '
  'renvoie true si hits <= p_max (autorisé), false sinon (bloqué). '
  'SECURITY DEFINER pour écrire malgré la RLS default-deny ; EXECUTE réservé '
  'à service_role.';

-- EXECUTE : uniquement service_role. Jamais anon/authenticated/PUBLIC.
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, int, int) FROM anon;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, int, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, int, int) TO service_role;

COMMIT;
