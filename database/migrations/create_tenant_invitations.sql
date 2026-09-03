-- T6 — inviter quelqu'un dans un espace, plutôt que de ne pouvoir que
-- rattacher un compte déjà existant.
--
-- `POST /api/admin/tenants/:id/staff` exige un staff_id déjà en base, sinon
-- 404 STAFF_NOT_FOUND : pour donner un accès à quelqu'un qui n'a jamais mis les
-- pieds sur la plateforme, il fallait lui créer un compte à la main, ailleurs,
-- puis revenir. C'est la friction la plus quotidienne de la gestion d'un espace.
create table if not exists tenant_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'admin', 'caster')),
  -- Jamais le jeton en clair : seule son empreinte est stockée, comme pour une
  -- clé d'API. Un dump de base ne doit pas donner d'accès.
  token_hash text not null unique,
  invited_by uuid references staff(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_staff_id uuid references staff(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Une seule invitation VIVANTE par adresse et par espace : relancer ne doit pas
-- empiler des jetons valides qu'on ne saurait plus révoquer d'un geste.
create unique index if not exists tenant_invitations_live_email_idx
  on tenant_invitations (tenant_id, lower(email))
  where accepted_at is null and revoked_at is null;

create index if not exists tenant_invitations_tenant_idx
  on tenant_invitations (tenant_id, created_at desc);

alter table tenant_invitations enable row level security;

-- Aucune politique : la table n'est lue et écrite QUE par le service_role
-- (routes admin). Le refus par défaut est la bonne réponse pour une table qui
-- contient des empreintes de jetons d'accès.

comment on table tenant_invitations is
  'Invitations à rejoindre un espace. Jeton haché, expiration, une seule vivante par email et par espace.';
