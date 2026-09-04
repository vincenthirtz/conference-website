-- La périodicité payée n'était portée que par le paiement (tenant_plan_payments)
-- et par le checkout (tenant_plan_checkouts). Le tenant, lui, ne la retenait
-- pas : tout ce qui raisonne APRÈS le paiement — la relance d'échéance, la
-- page de facturation — supposait donc l'année, et affichait 290 € à quelqu'un
-- qui paie 29 €.
alter table public.tenants
  add column if not exists plan_term text not null default 'year';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenants_plan_term_check'
  ) then
    alter table public.tenants
      add constraint tenants_plan_term_check check (plan_term in ('month', 'year'));
  end if;
end $$;

comment on column public.tenants.plan_term is
  'Périodicité du plan payé (month|year). Défaut year : les espaces antérieurs au mensuel ont tous payé à l''année.';
