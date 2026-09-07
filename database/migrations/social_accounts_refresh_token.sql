-- Jeton de rafraîchissement sur `social_accounts` — exigé par TikTok.
--
-- POURQUOI LA TABLE N'EN AVAIT PAS. Instagram, seul occupant jusqu'ici, n'a
-- pas de refresh token : son jeton longue durée (~60 j) se rafraîchit avec
-- LUI-MÊME (`ig_refresh_token`). Une colonne serait restée vide, et une colonne
-- vide se remplit un jour de travers.
--
-- TikTok fonctionne autrement, et de façon bien plus serrée : l'access token
-- vit 24 HEURES, le refresh token 365 jours. Sans le second persisté, la
-- connexion mourrait chaque nuit et il faudrait re-cliquer le consentement tous
-- les matins.
--
-- LE REFRESH TOKEN TOURNE. TikTok peut en renvoyer un NOUVEAU à chaque
-- rafraîchissement ; on réécrit donc toujours les deux colonnes ensemble.
--
-- Chiffré au repos comme l'access token (AES-256-GCM, utils/crypto.ts, clé
-- SECRETS_ENC_KEY) : il vaut mieux que l'access token, puisqu'il en fabrique
-- autant qu'on veut pendant un an.
--
-- Idempotent : re-jouable sans effet.

ALTER TABLE social_accounts
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted text,
  ADD COLUMN IF NOT EXISTS refresh_token_expires_at timestamptz;

COMMENT ON COLUMN social_accounts.refresh_token_encrypted IS
  'Jeton de rafraîchissement CHIFFRÉ (SECRETS_ENC_KEY). Vide chez Instagram, qui rafraîchit son jeton longue durée avec lui-même. TikTok le fait TOURNER : réécrire les deux colonnes à chaque rafraîchissement.';
COMMENT ON COLUMN social_accounts.refresh_token_expires_at IS
  'Échéance du jeton de rafraîchissement (365 j chez TikTok). Passée cette date, seule une ré-autorisation manuelle rétablit le service.';
