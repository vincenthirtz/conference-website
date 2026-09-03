-- T4 — le cycle de vie d'un espace, au-delà d'un booléen.
--
-- Un espace n'avait que `is_active`. « Archiver » le mettait à false, et c'est
-- tout : pas de motif, pas d'auteur, pas de date, et surtout aucune définition
-- partagée de ce que ça produit. Le résolveur refusait un espace inactif, mais
-- rien ne disait au client ce qu'il perdait, ni quand ses données
-- disparaîtraient — puisqu'elles ne disparaissaient jamais.
alter table tenants
  add column if not exists lifecycle_state text not null default 'active'
    check (lifecycle_state in ('active', 'suspended', 'archived', 'purge_scheduled', 'purged')),
  add column if not exists lifecycle_reason text,
  add column if not exists lifecycle_changed_at timestamptz,
  add column if not exists lifecycle_changed_by uuid references staff(id) on delete set null,
  add column if not exists purge_after timestamptz;

-- Reprise de l'existant : un espace déjà désactivé est un espace archivé.
update tenants
set lifecycle_state = 'archived'
where is_active = false and lifecycle_state = 'active';

-- `is_active` reste, DÉRIVÉ. 49 lectures de cette colonne vivent dans le
-- périmètre tenant seul ; les migrer d'un coup, c'était accepter qu'une seule
-- oubliée rouvre un espace fermé. Le trigger tient les deux d'accord, dans les
-- deux sens, tant que la migration des lectures n'est pas finie.
create or replace function sync_tenant_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.is_active := (new.lifecycle_state = 'active');
    return new;
  end if;

  if new.lifecycle_state is distinct from old.lifecycle_state then
    -- L'état fait foi.
    new.is_active := (new.lifecycle_state = 'active');
  elsif new.is_active is distinct from old.is_active then
    -- Écriture héritée sur le booléen : on la traduit.
    new.lifecycle_state := case when new.is_active then 'active' else 'archived' end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_tenant_lifecycle on tenants;
create trigger trg_sync_tenant_lifecycle
  before insert or update on tenants
  for each row execute function sync_tenant_lifecycle();

comment on column tenants.lifecycle_state is
  'active | suspended | archived | purge_scheduled | purged. `is_active` en est dérivé par trigger.';
comment on column tenants.lifecycle_reason is
  'Motif du dernier changement d''état. Obligatoire hors retour à active : un geste lourd se motive.';
