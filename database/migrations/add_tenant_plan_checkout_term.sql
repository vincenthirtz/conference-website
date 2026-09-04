-- Paiement au MOIS ou à l'ANNÉE.
--
-- Le barème n'existait qu'en annuel, et `applyTenantPlanPayment` ajoutait une
-- année en dur à chaque paiement. Une petite association ne sort pas 290 € d'un
-- coup en janvier : un tarif annuel seul écarte exactement les organisateurs
-- qu'on veut servir.
--
-- La périodicité voyage dans la metadata du checkout HelloAsso ; cette colonne
-- est le FILET, comme `plan` et `amount_expected` le sont déjà : si la metadata
-- ne revient pas dans la notification de paiement, on retrouve ici quoi
-- prolonger, et de combien.
alter table tenant_plan_checkouts
  add column if not exists term text not null default 'year'
    check (term in ('month', 'year'));

comment on column tenant_plan_checkouts.term is
  'Périodicité payée : month | year. Détermine de combien `plan_expires_at` est prolongé.';
