-- Migration: ajoute `tenant_discord_config.team_openings_channel_id` — le salon
--            où le bot annonce les équipes qui cherchent une joueuse.
-- Date: 2026-09-12
--
-- WHY:
--   Miroir de `free_players_channel_id`. Le site émet `team_opening.published`
--   quand une équipe publie une annonce ; le bot doit savoir OÙ la poster
--   (#🔎-recherche-joueuse-🔎). Sans colonne, le bot résoudrait NULL et
--   sortirait sans un log — exactement le scénario qui a coûté onze annonces de
--   joueuses jamais publiées (cf. tenant_discord_free_players_channel.sql).
--
-- POURQUOI UNE COLONNE ET PAS `extras`. Parce que les endpoints bot
--   (/api/bot/v1/tenants/all-configs, /by-guild/:id) SÉLECTIONNENT nommément
--   les colonnes : une clé rangée dans le blob `extras` n'atteindrait pas
--   davantage le bot. La colonne doit exister aux QUATRE endroits, faute de
--   quoi elle ne sert à rien :
--     1. ici (la base),
--     2. la whitelist du PUT admin (pages/api/admin/tenants/[id]/discord-config/[guildId].ts),
--     3. les champs d'UI (utils/discord/discordConfigFields.ts),
--     4. le `select()` nommé + `emptyDiscordConfig()` des deux endpoints bot.
--
-- CAVEATS:
--   - Idempotente (ADD COLUMN IF NOT EXISTS) : re-jouable sans effet.
--   - Ajout pur, nullable : aucune perte de données. NULL = pas d'annonce
--     (no-op silencieux côté bot), soit le comportement actuel — la migration
--     ne change rien tant que l'admin n'a pas choisi un salon.
--   - Salon de production visé : 1545536672064741406 (serveur 1259186540001890474),
--     à renseigner depuis l'admin après application.
--
-- POSTGREST:
--   ADD COLUMN -> reload du schema cache (NOTIFY pgrst en fin), sinon la
--   nouvelle colonne reste invisible de l'API REST.
--
-- APRÈS APPLICATION : régénérer l'instantané de schéma dont dépend le garde-fou
--   `tests/unit/supabaseSelectSchema.test.ts` :
--     node scripts/refresh-schema-snapshot.mjs

BEGIN;

ALTER TABLE public.tenant_discord_config
  ADD COLUMN IF NOT EXISTS team_openings_channel_id text;

COMMENT ON COLUMN public.tenant_discord_config.team_openings_channel_id IS
  'Snowflake Discord du salon où annoncer les équipes qui cherchent une joueuse (event team_opening.published). NULL = pas d''annonce.';

COMMIT;

-- ===========================================================================
-- PostgREST schema cache reload (nouvelle colonne exposée via l'API REST)
-- ===========================================================================

NOTIFY pgrst, 'reload schema';
