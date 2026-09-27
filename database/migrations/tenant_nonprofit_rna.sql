-- Migration : Découverte offerte à toute association qui donne son numéro RNA.
-- Date: 2026-09-27
--
-- WHY. `tenant_nonprofit_verified.sql` (2026-09-16) a ouvert la gratuité du
--   palier Découverte, mais par UNE SEULE porte : relier ses identifiants API
--   HelloAsso. Le raisonnement tenait — HelloAsso n'ouvre de compte qu'à des
--   organismes à but non lucratif, donc un appel qui réussit prouve qu'une
--   association existe — et il écartait explicitement le RNA, « un numéro que
--   personne n'irait contrôler ».
--
--   Cette porte est trop étroite. Elle n'accueille que les associations qui
--   encaissent en ligne, et qui ont déjà choisi HelloAsso. Une association de
--   quartier qui veut organiser un tournoi n'a aucune raison d'avoir un compte
--   HelloAsso, et se retrouvait à payer 100 €/an un palier qui n'a même pas le
--   bot Discord — exactement le point de prix que le lot du 16/09 voulait
--   fermer.
--
-- CE QUI A CHANGÉ DEPUIS, ET QUI LÈVE L'OBJECTION. Le RNA EST contrôlable,
--   gratuitement et sans clé : l'Annuaire des Entreprises
--   (recherche-entreprises.api.gouv.fr, service public, sans authentification)
--   résout un numéro RNA en une structure, et dit si elle est une association
--   et si elle est en activité. « Personne n'irait contrôler » décrivait une
--   intention, pas une impossibilité — et l'intention a changé.
--
-- DEUX PORTES, UNE SEULE ESTAMPILLE. `nonprofit_verified_at` garde exactement
--   le sens qu'il avait : « une association a été vérifiée le … », ce qui rend
--   la Découverte non facturable (cf. utils/billing/nonprofitGrant.ts). Ce qui
--   change est la façon d'y arriver, d'où `nonprofit_verified_via`.
--
--   Le piège que cette colonne existe pour éviter : délier HelloAsso RETIRE
--   l'estampille (« la preuve disparaît avec le compte qui la portait »). Sans
--   savoir d'où vient la vérification, une association vérifiée par son RNA qui
--   aurait par ailleurs relié puis délié HelloAsso perdrait sa gratuité sans
--   qu'aucune preuve n'ait disparu.
--
-- LE CAS SANS SIREN, qui n'est pas un détail. L'Annuaire ne connaît que les
--   associations immatriculées à l'INSEE. Beaucoup de petites associations ont
--   un RNA et pas de SIREN : leur numéro est parfaitement valide et introuvable
--   dans l'annuaire. On ne les refuse donc PAS — on enregistre la déclaration
--   (`nonprofit_rna` + `nonprofit_rna_declared_at`) sans estampiller, et le
--   staff tranche. Estampiller automatiquement sur un numéro seulement
--   bien-formé reviendrait à offrir le palier à qui sait taper « W » suivi de
--   neuf chiffres.
--
-- CAVEATS:
--   - Additive et idempotente. Aucune valeur rétroactive : les espaces déjà
--     estampillés par HelloAsso sont recalés en `helloasso` ci-dessous, pour
--     qu'aucune ligne existante ne se retrouve avec une provenance inconnue.
--   - Le RNA est une donnée PUBLIQUE (l'Annuaire l'expose), ce n'est pas un
--     secret : il s'affiche en clair dans l'écran de facturation de l'espace.
--   - Rollback : DROP COLUMN nonprofit_rna, nonprofit_rna_declared_at,
--     nonprofit_verified_via.

BEGIN;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS nonprofit_rna text,
  ADD COLUMN IF NOT EXISTS nonprofit_rna_declared_at timestamptz,
  ADD COLUMN IF NOT EXISTS nonprofit_verified_via text;

-- Format du RNA : « W » suivi de 9 caractères alphanumériques. Les numéros
-- d'outre-mer ne sont pas tous purement numériques, d'où [0-9A-Z] et non [0-9].
-- La contrainte vaut sur la FORME, jamais sur l'existence : celle-ci se
-- vérifie contre l'annuaire, pas en base.
ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_nonprofit_rna_format;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_nonprofit_rna_format
  CHECK (nonprofit_rna IS NULL OR nonprofit_rna ~ '^W[0-9A-Z]{9}$');

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_nonprofit_verified_via;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_nonprofit_verified_via
  CHECK (
    nonprofit_verified_via IS NULL
    OR nonprofit_verified_via IN ('helloasso', 'rna', 'staff')
  );

COMMENT ON COLUMN public.tenants.nonprofit_rna IS
  'Numéro RNA déclaré par l''espace (format W + 9 alphanumériques). Donnée PUBLIQUE (exposée par l''Annuaire des Entreprises), affichée en clair côté facturation. Déclaré n''est pas vérifié : voir nonprofit_verified_at.';

COMMENT ON COLUMN public.tenants.nonprofit_rna_declared_at IS
  'Date de déclaration du RNA. Renseignée même quand l''annuaire ne trouve rien (association sans SIREN) : c''est la file d''attente de la validation staff.';

COMMENT ON COLUMN public.tenants.nonprofit_verified_via IS
  'D''où vient l''estampille nonprofit_verified_at : helloasso (identifiants API reliés), rna (numéro résolu dans l''Annuaire des Entreprises) ou staff (validation manuelle). Délier HelloAsso ne retire l''estampille que si elle vient de helloasso.';

-- Aucune ligne ne doit rester avec une estampille de provenance inconnue :
-- avant ce jour, la seule porte était HelloAsso.
UPDATE public.tenants
   SET nonprofit_verified_via = 'helloasso'
 WHERE nonprofit_verified_at IS NOT NULL
   AND nonprofit_verified_via IS NULL;

COMMIT;
