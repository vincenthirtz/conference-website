-- Migration: ajoute `tenant_discord_config.free_players_channel_id` — le salon
--            où le bot annonce les joueuses qui se signalent « sans équipe ».
-- Date: 2026-09-12
--
-- WHY:
--   Le pont existait déjà des deux côtés, sauf au milieu. Le site émet
--   `free_player.registered` (pages/api/public/free-players/index.ts) et le bot
--   sait le recevoir : `free-player-events.js` construit l'embed, mentionne le
--   rôle manager et renvoie vers l'espace équipe. Mais il résout son salon avec
--   `getChannelId(guildId, 'free_players_channel_id', 'FREE_PLAYERS_CHANNEL_ID')`,
--   et cette clé n'existait NULLE PART : pas de colonne ici, `extras` vide sur
--   les deux guilds de production, variable d'environnement absente. Résultat :
--   `getChannelId` renvoyait NULL, le handler sortait immédiatement — sans
--   erreur, sans log. Onze fiches en base, dont cinq créées depuis le site,
--   n'ont jamais été annoncées à personne.
--
--   Une inscription qui n'est annoncée nulle part n'est pas une rencontre :
--   c'est une ligne qui attend qu'une capitaine pense à aller consulter une
--   liste. L'annonce est tout l'intérêt de la fonctionnalité.
--
-- WHAT:
--   ADD COLUMN free_players_channel_id text (nullable — snowflake du salon).
--
-- POURQUOI UNE COLONNE ET PAS `extras`. Même raison que welcome_* et
--   member_leave_channel_id : c'est un salon comme les autres, éditable depuis
--   l'admin, et les colonnes typées sont ce que les endpoints bot
--   (/api/bot/v1/tenants/all-configs, /by-guild/:id) SÉLECTIONNENT nommément.
--   Une clé rangée dans le blob `extras` n'aurait pas davantage atteint le bot.
--
-- CAVEATS:
--   - Idempotente (ADD COLUMN IF NOT EXISTS) : re-jouable sans effet.
--   - Ajout pur, nullable : aucune perte de données, aucune valeur par défaut à
--     rétro-remplir. NULL = pas d'annonce (no-op silencieux côté bot), ce qui
--     est exactement le comportement actuel — la migration ne change donc rien
--     tant que l'admin n'a pas choisi un salon.
--   - Le fallback env `FREE_PLAYERS_CHANNEL_ID` reste valide côté bot ; la
--     colonne prend le pas dès qu'elle est renseignée.
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
  ADD COLUMN IF NOT EXISTS free_players_channel_id text;

COMMENT ON COLUMN public.tenant_discord_config.free_players_channel_id IS
  'Snowflake Discord du salon où annoncer les joueuses inscrites « sans équipe » (event free_player.registered), avec mention du rôle manager. NULL = pas d''annonce.';

COMMIT;

-- ===========================================================================
-- PostgREST schema cache reload (nouvelle colonne exposée via l'API REST)
-- ===========================================================================

NOTIFY pgrst, 'reload schema';
