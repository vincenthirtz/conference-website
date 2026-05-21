-- Description: Durcissement RLS sur public.twitch_channels.
--
-- Avant cette migration, la table avait une seule policy
-- `twitch_channels_select_policy USING (true)` qui laissait passer toutes
-- les lectures pour les rôles `anon` et `authenticated`. C'était defense
-- defense-in-depth contre un éventuel client direct, mais en pratique tous
-- les handlers (`pages/api/twitch-channels.ts`, `pages/api/twitch/live.ts`,
-- `pages/api/bot/v1/twitch/live.ts`, `pages/api/admin/twitch-channels/*`)
-- utilisent `supabaseAdmin` (service-role) qui bypasse RLS — la policy
-- permissive n'avait donc aucun consommateur légitime.
--
-- Après #2 (chantier multi-tenant V1) la table porte `tenant_id NOT NULL`
-- et les handlers filtrent côté API. Conserver la policy `USING (true)`
-- n'apporte rien et permettrait à un futur appel client anon (par erreur
-- ou par évolution) de lire les channels de tous les tenants.
--
-- Plan : DROP la policy. RLS reste enabled — sans policy pour anon /
-- authenticated, les lectures non-service_role renvoient 0 rows.
-- Service-role bypass = nominal pour les handlers actuels.
--
-- Si un futur endpoint devait servir twitch_channels en anon avec
-- scoping tenant, ajouter une policy qui lit le tenant via JWT claim
-- ou request setting plutôt que de remettre `USING (true)`.

DROP POLICY IF EXISTS twitch_channels_select_policy ON public.twitch_channels;

NOTIFY pgrst, 'reload schema';
