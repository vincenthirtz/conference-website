/* ---------------------------------------------------------------------------
 * free_players_lifecycle.sql — relance avant péremption + ancrage Discord
 *
 * POURQUOI. Une annonce « joueuse libre » publiée depuis /rejoindre vivait
 * soixante jours puis disparaissait de la liste SANS QUE PERSONNE NE LE SACHE :
 * ni prévenance, ni moyen de dire « je cherche toujours ». Et son annonce
 * Discord, elle, survivait à tout — retrait, expiration, suppression staff — car
 * le bot ne gardait pas l'identifiant du message qu'il avait posté.
 *
 * QUOI.
 *   - `expiry_reminder_sent_at` : date de la relance « ton annonce expire
 *     bientôt » (cron `free-players-expiry`). Remise à NULL quand l'annonce est
 *     prolongée — un nouveau cycle de soixante jours mérite sa propre relance.
 *     C'est la déduplication : un cron rejoué ne renvoie pas l'email.
 *   - `discord_announce_channel_id` / `discord_announce_message_id` : où le bot
 *     a posté l'annonce (route bot `free-players/announcement`, même principe
 *     que l'ancrage du vote MVP public). Le site s'en sert pour demander la
 *     suppression (`free_player.withdrawn`) puis les remet à NULL, ce qui rend
 *     la demande unique.
 *
 * Colonnes nullables, sans défaut : aucune réécriture de table, aucune ligne
 * existante n'a à changer de sens.
 *
 * IDEMPOTENT.
 * ------------------------------------------------------------------------- */

BEGIN;

ALTER TABLE public.free_players
  ADD COLUMN IF NOT EXISTS expiry_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS discord_announce_channel_id text,
  ADD COLUMN IF NOT EXISTS discord_announce_message_id text;

COMMENT ON COLUMN public.free_players.expiry_reminder_sent_at IS
  'Relance « expire bientôt » envoyée (web seulement). NULL après prolongation.';
COMMENT ON COLUMN public.free_players.discord_announce_message_id IS
  'Message d''annonce posté par le bot. NULL une fois sa suppression demandée.';

COMMIT;

NOTIFY pgrst, 'reload schema';
