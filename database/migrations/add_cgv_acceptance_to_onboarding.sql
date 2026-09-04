-- L'acceptation des CGV à l'OUVERTURE de l'espace, distincte de celle qui
-- précède chaque commande payante (table plan_cgv_acceptances).
--
-- Le consentement est donné par un humain sur le formulaire web, mais l'espace
-- est créé plus tard par une étape machine (rattachement du serveur Discord) :
-- il doit donc voyager de la demande jusqu'au tenant, sinon il se perd entre
-- les deux et l'espace naît sans qu'on sache si quiconque a accepté quoi.
--
-- `null` est un état LÉGITIME et signifiant : espace créé par le staff, ou
-- antérieur aux CGV. On ne le remplit pas rétroactivement — antidater une
-- acceptation vaudrait moins que de reconnaître qu'elle manque.
alter table public.tenant_requests
  add column if not exists cgv_version text,
  add column if not exists cgv_accepted_at timestamptz;

alter table public.tenants
  add column if not exists cgv_version text,
  add column if not exists cgv_accepted_at timestamptz,
  add column if not exists cgv_accepted_by uuid;

comment on column public.tenants.cgv_version is
  'Version des CGV acceptée à l''ouverture de l''espace. NULL = jamais acceptée (espace créé par le staff, ou antérieur aux CGV) — à ne pas remplir rétroactivement.';
comment on column public.tenant_requests.cgv_version is
  'Version des CGV acceptée sur le formulaire d''onboarding, reportée sur le tenant au provisioning.';
