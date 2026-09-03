-- T7 — un domaine propre se prouve.
--
-- `tenants.custom_domain` était un champ texte validé en syntaxe seule, et le
-- résolveur routait dessus : personne ne prouvait posséder le domaine déclaré,
-- et une faute de frappe produisait un site qui ne répondait jamais, sans un
-- mot d'explication.
alter table tenants
  add column if not exists custom_domain_state text
    check (custom_domain_state in ('pending', 'verified', 'failed')),
  -- Jeton de preuve, publié par le client dans un TXT. Il ne donne aucun accès :
  -- il prouve seulement qu'on tient la zone DNS du domaine.
  add column if not exists custom_domain_token text,
  add column if not exists custom_domain_checked_at timestamptz,
  add column if not exists custom_domain_error text;

-- Deux espaces ne peuvent pas revendiquer le même domaine VÉRIFIÉ. La
-- contrainte est partielle : deux `pending` sur le même nom sont tolérés (le
-- premier qui prouve gagne), mais deux routages contradictoires, jamais.
create unique index if not exists tenants_verified_custom_domain_idx
  on tenants (lower(custom_domain))
  where custom_domain is not null and custom_domain_state = 'verified';

-- Les domaines déjà posés avant ce lot : ils routaient sans preuve. On ne les
-- coupe pas d'autorité, on les marque à vérifier — le prochain passage du cron
-- (ou un clic) tranchera.
update tenants
set custom_domain_state = 'pending'
where custom_domain is not null and custom_domain_state is null;

comment on column tenants.custom_domain_state is
  'pending | verified | failed. Seul verified est routé (cf. utils/tenant.ts).';
