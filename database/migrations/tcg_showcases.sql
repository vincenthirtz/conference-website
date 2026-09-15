-- Migration : la VITRINE TCG — jusqu'à trois cartes qu'une joueuse choisit de
--             montrer sur sa fiche publique.
-- Date: 2026-09-15
--
-- WHY:
--   Montrer ses plus belles cartes est l'interaction qui donne envie de revenir
--   compléter une collection. `/player/[userId]` montrait déjà la carte de la
--   joueuse ; la vitrine y ajoute, SI ELLE LE DEMANDE, trois cartes de sa
--   collection. Lecture et écriture : `utils/tcg/showcase.ts`,
--   `pages/api/player/tcg/showcase.ts`.
--
-- OPT-IN, DÉSACTIVÉE PAR DÉFAUT. `enabled` vaut `false` par défaut, et
--   l'absence de ligne vaut « désactivée ». La collection reste privée.
--
-- DES RÉFÉRENCES DE SUJET, JAMAIS UNE CARTE NI UNE IMAGE.
--   `subject_keys` porte `player:<uuid>`, `team:<uuid>` ou `map:<slug>` (le
--   format de `utils/tcg/subjectKey.ts`). Pas de clé étrangère vers
--   `tcg_pack_cards` : la vitrine se RELIT contre la possession réelle à chaque
--   affichage — une carte recyclée ou échangée en sort d'elle-même — et la face
--   passe par `readCardFaces.ts`, seul porteur du filtre de consentement. Figer
--   une URL d'image ici rendrait le retrait d'une photo impossible à honorer.
--
-- L'INDEX GIN sert une seule lecture : retrouver les vitrines ACTIVES qui
--   exposent la carte d'une joueuse, pour régénérer leurs fiches quand sa photo
--   change (`revalidatePlayerCard.ts`). Sans lui, un retrait de photo balaierait
--   la table.
--
-- CAVEATS:
--   - Idempotente (IF NOT EXISTS, DROP POLICY avant CREATE POLICY).
--   - tenant_id NOT NULL + FK tenants ON DELETE RESTRICT : convention Tier-1.
--   - `user_id` sans FK vers auth.users, comme `tcg_wallets` : le schéma `auth`
--     n'est pas référencé par les tables TCG.
--   - RLS activée + policy service_role seule : rien n'est lu par le client en
--     direct, tout passe par les routes serveur et `getStaticProps`.
--   - Rollback : DROP TABLE public.tcg_showcases (aucune autre table n'en
--     dépend).
--   - Après application : `node scripts/refresh-schema-snapshot.mjs`
--     (l'instantané a été complété à la main pour cette table).
--   - NON APPLIQUÉE à la rédaction (2026-09-15).

BEGIN;

CREATE TABLE IF NOT EXISTS public.tcg_showcases (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  subject_keys text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id),
  -- Trois cartes au plus : la même borne que `MAX_SHOWCASE_CARDS`. Le code
  -- valide déjà ; la base refuse ce qu'un appelant négligent enverrait.
  CONSTRAINT tcg_showcases_max_cards
    CHECK (cardinality(subject_keys) <= 3)
);

CREATE INDEX IF NOT EXISTS idx_tcg_showcases_subject_keys
  ON public.tcg_showcases USING gin (subject_keys)
  WHERE enabled;

ALTER TABLE public.tcg_showcases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tcg_showcases_service_role ON public.tcg_showcases;
CREATE POLICY tcg_showcases_service_role ON public.tcg_showcases
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.tcg_showcases IS
  'Vitrine TCG d''une joueuse sur sa fiche publique : opt-in (enabled false par défaut), trois références de sujet au plus. Aucune image ni carte figée : la vitrine est relue contre la possession réelle et les faces passent par le filtre de consentement.';
COMMENT ON COLUMN public.tcg_showcases.subject_keys IS
  'Références de sujet : player:<uuid>, team:<uuid> ou map:<slug>. Jamais un exemplaire, jamais une URL.';

COMMIT;

NOTIFY pgrst, 'reload schema';
