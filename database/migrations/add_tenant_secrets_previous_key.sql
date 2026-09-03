-- T8 — rotation des secrets bot sans coupure.
--
-- `tenant_secrets` ne portait qu'UNE empreinte de clé : régénérer invalidait
-- l'ancienne à la milliseconde, donc coupait le bot en place jusqu'à ce que
-- quelqu'un aille reposer la nouvelle valeur sur le serveur. Une opération à
-- fenêtre de panne pour un geste qui devrait être anodin.
--
-- On garde l'empreinte précédente valable un temps borné (48 h par défaut,
-- décidé côté application), révocable immédiatement en cas de fuite.
alter table tenant_secrets
  add column if not exists previous_key_hash text,
  add column if not exists previous_key_expires_at timestamptz,
  -- Dernière fois qu'une clé de cet espace a servi : distingue « bot jamais
  -- installé » de « bot mort il y a trois semaines ». Écrit au plus une fois
  -- par TTL de cache d'authentification, jamais à chaque requête.
  add column if not exists last_used_at timestamptz;

-- L'authentification du bot cherche par empreinte : sans index, la clé
-- précédente ferait un scan complet à chaque miss de cache.
create index if not exists tenant_secrets_previous_key_hash_idx
  on tenant_secrets (previous_key_hash)
  where previous_key_hash is not null;

comment on column tenant_secrets.previous_key_hash is
  'Empreinte de la clé précédente, acceptée jusqu''à previous_key_expires_at (rotation sans coupure).';
comment on column tenant_secrets.last_used_at is
  'Dernière authentification réussie avec une clé de cet espace (précision : TTL du cache).';
