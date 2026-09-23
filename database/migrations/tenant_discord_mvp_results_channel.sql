-- Migration: ajoute `tenant_discord_config.mvp_results_channel_id` — le salon
--            où le bot annonce QUI est MVP quand un vote se clôt.
-- Date: 2026-09-23
--
-- WHY:
--   Aujourd'hui, la clôture d'un vote MVP ne produit AUCUNE annonce : le bot
--   édite en place le message du vote, dans `mvp_votes_channel_id`. Qui ne
--   regarde pas ce salon-là ne saura jamais qui a été élue. La régie veut une
--   annonce dans un salon à elle (1270051618112671788 en prod).
--
--   Le salon du VOTE et le salon de l'ANNONCE sont deux choses distinctes, et
--   c'est le but : on vote dans un salon de travail, on annonce dans un salon
--   qui se lit. D'où une seconde colonne plutôt qu'une réutilisation.
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
--   Cet avertissement n'est pas décoratif : `free_players_channel_id` a vécu
--   dans l'UI sans colonne en base, le PUT répondait 200, et onze annonces de
--   joueuses ne sont parties nulle part (cf. tenant_discord_free_players_channel.sql).
--
-- ORDRE D'APPLICATION, À NE PAS INVERSER. Cette migration doit être appliquée
--   AVANT le déploiement du code qui cite la colonne. PostgREST rejette la
--   requête ENTIÈRE sur une colonne inconnue (42703) : les deux endpoints de
--   config tenant répondraient 500 et le bot perdrait toute sa configuration
--   Discord, pas seulement le MVP.
--
-- CAVEATS:
--   - Idempotente (ADD COLUMN IF NOT EXISTS) : re-jouable sans effet.
--   - Ajout pur, nullable : aucune perte de données. NULL = pas d'annonce
--     (no-op silencieux côté bot), soit exactement le comportement actuel.
--     La migration seule ne change donc rien.
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
  ADD COLUMN IF NOT EXISTS mvp_results_channel_id text;

COMMENT ON COLUMN public.tenant_discord_config.mvp_results_channel_id IS
  'Snowflake Discord du salon où annoncer la MVP à la clôture d''un vote. Distinct du salon de vote (mvp_votes_channel_id, côté bot). NULL = pas d''annonce.';

COMMIT;

-- ===========================================================================
-- PostgREST schema cache reload (nouvelle colonne exposée via l'API REST)
-- ===========================================================================

NOTIFY pgrst, 'reload schema';
