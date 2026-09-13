-- Migration : la récompense de points de chaîne qui déclenche un drop TCG.
-- Date: 2026-09-14
--
-- POURQUOI CETTE COLONNE EXISTE — un défaut à réparer, pas un confort.
--
-- Le webhook `pages/api/webhooks/twitch/tcg-drop.ts` écoute
-- `channel.channel_points_custom_reward_redemption.add` et ne lit PAS quelle
-- récompense a été échangée. En l'état, « mettre en avant mon message », un son
-- ou un emote déclencheraient un drop TCG : une carte offerte à quelqu'un qui
-- ne l'a pas demandée, prise sur la même économie que les victoires en match.
--
-- Il faut donc désigner UNE récompense, et il faut la ranger quelque part.
-- Aucune table ne convenait : `twitch_channels` liste les chaînes à annoncer
-- (pas de notion de connexion), `tenant_discord_config` est du Discord, et
-- `tenant_secrets` porte des secrets. La récompense, elle, appartient à la
-- CHAÎNE CONNECTÉE — elle est créée par son propriétaire, elle disparaît avec
-- la déconnexion. Sa place est donc ici, avec la même durée de vie que son
-- sujet.
--
-- UNE SOURCE POUR DEUX LECTEURS. La condition de l'abonnement EventSub
-- (`reward_id`) et le filtre du webhook lisent la MÊME valeur. Deux réglages
-- séparés auraient pu diverger, et la divergence ne se serait vue que le jour
-- où quelqu'un échange la mauvaise récompense.
--
-- NULLABLE, ET C'EST VOULU. `NULL` = aucune récompense désignée. Le webhook
-- REFUSE alors d'attribuer quoi que ce soit plutôt que d'accepter tout : le
-- défaut sûr est de ne rien donner, jamais de tout donner.
--
-- PAS DE CONTRAINTE D'INTÉGRITÉ POSSIBLE : les récompenses vivent chez Twitch,
-- pas dans cette base. La validité de l'identifiant ne peut être vérifiée qu'au
-- moment de créer l'abonnement, où Twitch refusera un identifiant inconnu.
--
-- CAVEATS :
--   - Idempotente : ADD COLUMN IF NOT EXISTS.
--   - Purement ADDITIVE : une colonne nullable sur une table qui compte
--     aujourd'hui zéro ligne (aucune chaîne encore connectée en OAuth).

ALTER TABLE public.twitch_broadcaster_connections
  ADD COLUMN IF NOT EXISTS tcg_reward_id text;

COMMENT ON COLUMN public.twitch_broadcaster_connections.tcg_reward_id IS
  'Identifiant Twitch de la récompense de points de chaîne qui déclenche un drop TCG. NULL = aucune désignée, et le webhook n''attribue alors RIEN (défaut sûr). Lu à la fois par la condition de l''abonnement EventSub et par le filtre du webhook — une seule source, pour qu''ils ne puissent pas diverger.';

-- PostgREST doit revoir son cache de schéma, sinon la colonne reste invisible à
-- l'API jusqu'au prochain redémarrage.
NOTIFY pgrst, 'reload schema';
