-- Comptes réseaux connectés par OAuth — aujourd'hui Instagram.
--
-- La table manquait volontairement au premier lot : les deux cibles d'alors
-- (site + salon Discord) n'ont aucun identifiant à ranger, et une table qu'on
-- n'interroge pas est pire que pas de table. Instagram change ça — il y a
-- enfin un jeton, une expiration et un identifiant de compte à persister.
--
-- LE JETON EST CHIFFRÉ (AES-256-GCM, utils/crypto.ts, clé SECRETS_ENC_KEY).
-- Jamais en clair en base, jamais renvoyé à un client. Même discipline que
-- twitch_broadcaster_connections, pour la même raison : ce jeton publie en
-- notre nom sur une surface publique.
--
-- POURQUOI UNE EXPIRATION EN COLONNE. Les jetons longue durée Instagram
-- meurent au bout de ~60 jours et doivent être rafraîchis AVANT l'échéance
-- (le rafraîchissement exige un jeton encore valide). Sans cette colonne, on
-- ne saurait pas qui rafraîchir, et le premier symptôme serait une publication
-- en échec — c'est-à-dire trop tard, puisque la seule issue est alors une
-- ré-autorisation manuelle.
--
-- RLS : activée sans aucune policy. Service role uniquement.
--
-- Idempotent : re-jouable sans effet.

CREATE TABLE IF NOT EXISTS social_accounts (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  -- Clé de `utils/social/platforms.ts`. Pas de CHECK : le catalogue vit dans le
  -- code, et un enum SQL imposerait une migration à chaque cible ajoutée.
  platform      text NOT NULL,
  /* Identifiant du compte chez la plateforme (IG user id). C'est lui qu'on
     préfixe aux appels de publication — le `me` implicite d'un jeton change de
     sens quand le jeton change. */
  external_account_id text,
  /* Ce qu'on montre dans l'admin : @womenscup_asso. Purement informatif. */
  handle        text,
  access_token_encrypted text,
  token_expires_at timestamptz,
  scopes        text[] NOT NULL DEFAULT '{}',
  /* 'connected' | 'expired' | 'revoked'. Texte libre pour la même raison que
     `platform` : l'état de santé d'une intégration se précise avec l'usage. */
  status        text NOT NULL DEFAULT 'connected',
  last_error    text,
  connected_at  timestamptz,
  connected_by  uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Un seul compte connecté par plateforme et par tenant : deux jetons
  -- concurrents pour Instagram publieraient depuis un compte imprévisible.
  UNIQUE (tenant_id, platform)
);

-- Sert le cron de rafraîchissement : « les jetons qui approchent de l'échéance ».
CREATE INDEX IF NOT EXISTS idx_social_accounts_expiring
  ON social_accounts (token_expires_at)
  WHERE status = 'connected' AND token_expires_at IS NOT NULL;

ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE social_accounts IS
  'Comptes réseaux connectés par OAuth. Jeton CHIFFRÉ (SECRETS_ENC_KEY) — jamais en clair, jamais renvoyé à un client.';
COMMENT ON COLUMN social_accounts.token_expires_at IS
  'Échéance du jeton longue durée (~60 j chez Instagram). Le rafraîchissement exige un jeton ENCORE valide : passé cette date, seule une ré-autorisation manuelle rétablit le service.';
