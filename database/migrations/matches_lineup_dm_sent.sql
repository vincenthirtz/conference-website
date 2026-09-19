-- Migration : marqueurs d'envoi du MP « feuille de match ».
-- Date: 2026-09-20
--
-- WHY. Le rappel de feuille n'existait que sous forme d'un message dans le
--   salon de check-in, 20 min avant le coup d'envoi. Le 18/09/2026, les deux
--   équipes du match de 20h30 l'ont ignoré et ont joué sans feuille : le
--   classement a crédité 9 et 7 joueuses au lieu de 5. Le MP, lui, a fonctionné
--   ce soir-là pour le check-in (les deux capitaines ont pointé dans les
--   minutes suivantes).
--
-- POURQUOI DES COLONNES SÉPARÉES de `team{1,2}_lineup_reminder_sent_at`. Ces
--   dernières appartiennent au cron (message de salon). Les réutiliser ferait
--   que le premier des deux canaux à partir empêcherait l'autre — chacun son
--   marqueur, comme `team{1,2}_captain_dm_30_sent_at` pour le check-in.
--
-- CAVEATS:
--   - Additive et idempotente ; NULL = jamais envoyé.
--   - Rollback : DROP COLUMN sur les deux colonnes.
--   - APPLIQUÉE en production le 2026-09-20, instantané de schéma régénéré.

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS team1_lineup_dm_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS team2_lineup_dm_sent_at timestamptz;

COMMENT ON COLUMN public.matches.team1_lineup_dm_sent_at IS
  'MP « feuille de match » envoyé à l''encadrement de l''équipe 1 (NULL = jamais).';
COMMENT ON COLUMN public.matches.team2_lineup_dm_sent_at IS
  'MP « feuille de match » envoyé à l''encadrement de l''équipe 2 (NULL = jamais).';
