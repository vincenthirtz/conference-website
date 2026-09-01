-- Migration : abonnement calendrier personnel de l'espace joueur (lot J2 de
-- docs/PLAN-espace-joueur.md).
--
-- Pourquoi une table et pas un jeton dérivé (HMAC de l'user id) : un flux ICS
-- est collé dans Google/Apple Calendar et vit ensuite hors de notre contrôle.
-- Il DOIT être révocable individuellement, sans changer de secret serveur ni
-- casser les abonnements des autres. Un jeton dérivé ne se révoque pas.
--
-- Le jeton est porteur : quiconque l'a lit l'agenda de la personne. D'où
--   * un jeton par (tenant, compte) ACTIF à la fois — la rotation révoque le
--     précédent, ce qui est exactement le geste « on m'a volé mon lien » ;
--   * aucune donnée dans le jeton (opaque, 32 octets base64url) ;
--   * `last_used_at` pour que la personne puisse constater qu'un lien oublié
--     sert encore.
--
-- RLS : service-role uniquement. Les routes passent par supabaseAdmin, aucun
-- client anon n'a affaire à cette table.
--
-- Idempotente : rejouable sans effet de bord.

BEGIN;

CREATE TABLE IF NOT EXISTS public.player_calendar_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  auth_user_id  UUID NOT NULL,
  token         TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

-- Un jeton est unique globalement : c'est lui qui identifie l'appelant.
CREATE UNIQUE INDEX IF NOT EXISTS player_calendar_tokens_token_key
  ON public.player_calendar_tokens (token);

-- Au plus UN jeton actif par (tenant, compte). Index partiel : les jetons
-- révoqués restent en base (trace) sans bloquer la rotation.
CREATE UNIQUE INDEX IF NOT EXISTS player_calendar_tokens_active_key
  ON public.player_calendar_tokens (tenant_id, auth_user_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.player_calendar_tokens ENABLE ROW LEVEL SECURITY;

-- Aucune policy : RLS activée sans policy = tout est refusé aux rôles anon /
-- authenticated. Seul le service-role (qui contourne la RLS) y accède, comme
-- pour les autres tables à secret porteur.

COMMIT;
