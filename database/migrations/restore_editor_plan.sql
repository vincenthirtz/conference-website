-- Le palier « Éditeur » revient, sur devis.
--
-- Il avait été retiré parce qu'aucun espace ne le portait et qu'une colonne
-- « sur devis » occupait la place d'une offre lisible. Ce qu'il vend
-- aujourd'hui n'est plus une case du barème mais un logiciel — Womenscup OBS,
-- notre régie vidéo — déployé et accompagné. `PLAN_PRICES_EUR.editor = null`
-- (pas de tarif catalogue) suffit à l'exclure du paiement en ligne.
alter table public.tenants drop constraint if exists tenants_plan_check;
alter table public.tenants
  add constraint tenants_plan_check
  check (plan in ('foundation', 'discovery', 'regie', 'circuit', 'editor'));
