-- Migration: ajoute `tenant_discord_config.free_players_channel_id` — le salon
--            où le bot annonce les joueuses qui se signalent « sans équipe ».
-- Date: 2026-09-12
--
-- WHY:
--   RECTIFICATION (2026-09-12, même jour) : la première version de cet en-tête
--   affirmait que la clé n'existait NULLE PART et que l'annonce ne partait
--   jamais. C'était FAUX, et la migration a été appliquée sur ce malentendu.
--   Le repli `Environment=FREE_PLAYERS_CHANNEL_ID=…` est posé dans
--   `quadlet/discord-bot.container` (docker-box) depuis le 2026-08-23, et le
--   bot annonce bien : messages « 🔎 Une joueuse cherche une équipe » les
--   28, 29, 30 août et 7 septembre, log `free-player-events: annonce publiée`
--   à l'appui.
--
--   CE QUI JUSTIFIE QUAND MÊME LA COLONNE : `envFallbackAllowed()`
--   (services/discord-bot/tenant-config.js) n'autorise le repli par variable
--   d'environnement que pour le serveur « maison ». Pour tout autre serveur
--   rattaché — il y en a un second en production — une clé absente de la base
--   vaut « fonction désactivée ». Sans cette colonne, l'annonce des joueuses
--   libres était donc structurellement réservée à un seul serveur, et
--   inconfigurable depuis l'admin.
--
--   Leçon de méthode, à ne pas répéter : la configuration non sensible du bot
--   vit dans l'unité quadlet, PAS dans `services/discord-bot/.env`. Chercher
--   dans le seul `.env` fait conclure à tort à une variable manquante.
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
