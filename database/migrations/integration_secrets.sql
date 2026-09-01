-- Secrets d'intégration chiffrés, hors variables d'environnement.
--
-- POURQUOI. Netlify exécute ses fonctions en mode compatibilité Lambda, qui
-- plafonne l'ENSEMBLE des variables d'environnement à 4 Ko. Ce budget était
-- déjà presque plein : y ajouter la clé privée du compte de service Google
-- (1,7 Ko) a fait échouer la création des dix-neuf fonctions cron, et le
-- déploiement entier avec — deux fois, le 2026-09-01. Une clé privée n'a de
-- toute façon rien à faire dans l'environnement de build, où elle est exposée
-- à tout ce qui s'y exécute, plugins compris.
--
-- Les valeurs sont chiffrées AES-256-GCM CÔTÉ APPLICATION (utils/crypto.ts,
-- clé dérivée de SECRETS_ENC_KEY) : la base ne voit jamais le clair. Ce que
-- l'environnement garde désormais, c'est uniquement la clé de chiffrement.
--
-- Idempotent : re-jouable sans effet.

CREATE TABLE IF NOT EXISTS integration_secrets (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key text NOT NULL,
  value_encrypted text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES staff(id) ON DELETE SET NULL,
  PRIMARY KEY (tenant_id, key)
);

COMMENT ON TABLE integration_secrets IS
  'Secrets d''integration trop volumineux ou trop nombreux pour les variables d''environnement (Netlify plafonne l''env des fonctions a 4 Ko en mode compatibilite Lambda). Valeurs chiffrees AES-256-GCM cote application — la base ne voit jamais le clair.';
COMMENT ON COLUMN integration_secrets.value_encrypted IS
  'Format v1.<iv>.<tag>.<ciphertext>, cf. utils/crypto.ts. Jamais de valeur en clair ici.';

ALTER TABLE integration_secrets ENABLE ROW LEVEL SECURITY;

-- Aucune ouverture : la table n'est accessible que par la service role (routes
-- admin). Un secret chiffré reste un secret — le rendre lisible par une session
-- authentifiée, fût-elle staff, n'a aucune raison d'être.
DROP POLICY IF EXISTS integration_secrets_deny_all ON integration_secrets;
CREATE POLICY integration_secrets_deny_all ON integration_secrets
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
