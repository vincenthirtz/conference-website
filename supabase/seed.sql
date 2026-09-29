-- =============================================================================
-- SEED E2E — données de TEST inventées, appliquées par `supabase start` /
-- `supabase db reset` APRÈS le socle (supabase/config.toml → [db.seed]).
-- Aucune donnée n'est copiée de la production.
-- =============================================================================
--
-- Le tenant par défaut. Son UUID est une constante du code, pas une donnée :
-- utils/tenantId.ts (`DEFAULT_TENANT_ID`) et tests/utils/supabaseTestClient.ts
-- le codent en dur, et 114 clés étrangères `tenant_id` pointent sur `tenants`.
-- Sans cette ligne, tout seed de spec (seedTournament, équipes, casteurs…)
-- échoue sur `…_tenant_id_fkey`. Le slug `conference` reprend la migration
-- d'origine (database/migrations/create_tenants_and_discord_guilds.sql) ; le
-- plan `foundation` est celui de l'espace « maison », qui a toutes les
-- capacités (utils/billing/botPlanGate.ts) — sans quoi des écrans seraient
-- masqués par une porte de plan que les specs ne testent pas.
INSERT INTO public.tenants (id, slug, name, is_active, default_locale, plan, plan_status, kind)
VALUES (
  'ce69a726-773e-4d12-b5eb-d2503aa752b4',
  'conference',
  'Conférence (e2e)',
  true,
  'fr',
  'foundation',
  'active',
  'organizer'
)
ON CONFLICT (id) DO NOTHING;
