-- Retrait du palier `editor`.
--
-- Il n'a jamais été porté par aucun espace (vérifié avant migration :
-- foundation × 1, regie × 1). C'était le « sur-devis » : pas de prix catalogue,
-- donc pas de lien de paiement self-service, donc une quatrième colonne sur la
-- grille tarifaire qui occupait la place d'une offre lisible pour une porte que
-- le formulaire de contact ouvre déjà.
--
-- La contrainte est resserrée pour que la base refuse ce que le code ne sait
-- plus produire. Sans ça, une valeur `editor` réintroduite à la main passerait
-- en base et casserait le rendu côté application (aucun libellé, aucun prix).
alter table tenants drop constraint if exists tenants_plan_check;

alter table tenants add constraint tenants_plan_check
  check (plan = any (array['foundation'::text, 'discovery'::text, 'regie'::text, 'circuit'::text]));
