-- Migration: add whitelabel branding columns to tenants
--
-- WHY:
--   Multi-tenant means each organisation should be able to make the public
--   vitrine *look like theirs* : their logo, their brand colors, and ideally
--   their own hostname (cup.myorg.gg) rather than a shared /t/<slug> path.
--   These are pure presentation attributes — nothing secret — so they live
--   on `tenants` next to slug/name and ride the existing public-read RLS.
--
-- SCHEMA (all columns nullable / additive — no backfill required):
--   - logo_url       text : tenant logo. A URL, either Supabase Storage or an
--                           external CDN. NULL => fall back to the platform mark.
--   - primary_color  text : brand primary color, hex `#rrggbb`.
--   - accent_color   text : brand accent color, hex `#rrggbb`.
--   - custom_domain  text : a custom hostname resolving to this tenant. Must be
--                           UNIQUE case-insensitively among non-NULL values so
--                           two tenants can't claim the same domain. Enforced
--                           via a partial unique index on lower(custom_domain).
--
-- RLS NOTE:
--   `tenants` already has a public-read policy (`tenants_select_public`,
--   USING is_active = true — see create_tenants_and_discord_guilds.sql). These
--   new columns are therefore readable by anonymous public pages for theming,
--   which is INTENTIONAL : branding is not sensitive. Writes remain
--   service_role only (no write policy on tenants), so only staff endpoints
--   using supabaseAdmin can mutate branding.
--
-- DEPLOY NOTES:
--   - Idempotent (ADD COLUMN IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS).
--   - No FK added => no PostgREST schema cache reload required.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS logo_url      text,
  ADD COLUMN IF NOT EXISTS primary_color text,
  ADD COLUMN IF NOT EXISTS accent_color  text,
  ADD COLUMN IF NOT EXISTS custom_domain text;

COMMENT ON COLUMN public.tenants.logo_url IS
  'Whitelabel : URL du logo du tenant (Supabase Storage ou externe). NULL => logo plateforme par defaut.';
COMMENT ON COLUMN public.tenants.primary_color IS
  'Whitelabel : couleur primaire de marque, format hex #rrggbb. Lisible en public (theming des pages vitrine).';
COMMENT ON COLUMN public.tenants.accent_color IS
  'Whitelabel : couleur d''accent de marque, format hex #rrggbb. Lisible en public (theming des pages vitrine).';
COMMENT ON COLUMN public.tenants.custom_domain IS
  'Whitelabel : hostname personnalise (ex cup.myorg.gg) qui resout vers ce tenant. Unique (insensible a la casse) parmi les valeurs non NULL.';

-- Unicite du domaine personnalise, insensible a la casse, uniquement sur les
-- valeurs renseignees : deux tenants ne peuvent pas revendiquer le meme host,
-- mais plusieurs tenants sans domaine (NULL) coexistent sans conflit.
CREATE UNIQUE INDEX IF NOT EXISTS tenants_custom_domain_key
  ON public.tenants (lower(custom_domain))
  WHERE custom_domain IS NOT NULL;
