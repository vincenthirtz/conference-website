-- Preuve d'acceptation des CGV, avant paiement.
--
-- Deux consentements DISTINCTS, et non un seul : l'acceptation des CGV
-- (art. 1127-1 c. civ.) et, pour un contenu numérique fourni immédiatement, la
-- demande expresse d'exécution immédiate assortie de la renonciation au droit
-- de rétractation (art. L221-28 13° c. conso.). Fondre les deux dans une case
-- unique fait perdre l'exception : le droit de rétractation de quatorze jours
-- subsiste alors intégralement.
--
-- Table à part, écrite AVANT la création du lien de paiement et de façon
-- bloquante : une acceptation qu'on ne sait pas prouver ne vaut rien, et la
-- ligne de mapping `tenant_plan_checkouts` est, elle, best-effort.
create table if not exists public.plan_cgv_acceptances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_id uuid not null,
  cgv_version text not null,
  plan text not null,
  term text not null check (term in ('month', 'year')),
  amount_cents integer not null check (amount_cents > 0),
  -- Consentement 1 : les CGV, dans la version nommée ci-dessus.
  cgv_accepted boolean not null default false,
  -- Consentement 2 : exécution immédiate demandée + renonciation reconnue.
  immediate_execution_waiver boolean not null default false,
  accepted_at timestamptz not null default now(),
  checkout_intent_id bigint
);

create index if not exists plan_cgv_acceptances_tenant_idx
  on public.plan_cgv_acceptances (tenant_id, accepted_at desc);

alter table public.plan_cgv_acceptances enable row level security;

comment on table public.plan_cgv_acceptances is
  'Preuve horodatée du double consentement précédant chaque commande payante : acceptation des CGV (version nommée) et renonciation au droit de rétractation pour exécution immédiate.';
