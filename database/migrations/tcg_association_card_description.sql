-- Migration : la DESCRIPTION des cartes de la catégorie « L'association ».
-- Date: 2026-10-12
--
-- WHY. Une carte de l'association représente souvent quelqu'un ou quelque
--   chose de l'association (la carte « Arukdo », un logo d'événement) : un
--   titre et un crédit ne disent pas QUI c'est. Un court texte « à propos »,
--   écrit par le staff dans l'onglet « L'association » de /admin/tcg, est
--   affiché sur la carte — collection, révélation d'un paquet, vitrine,
--   catalogue public.
--
-- RÉDIGÉE PAR LE STAFF, PAS PAR LA COMMUNAUTÉ. La colonne vit sur
--   `tcg_fanart_cards`, mais seule la catégorie `association` peut la
--   renseigner (CHECK ci-dessous) : une description de fan art serait un
--   texte libre d'inconnue publié sans file de relecture — la modération des
--   fan arts relit une image et un crédit, pas une prose.
--
-- TEXTE BRUT, ≤ 280 CARACTÈRES. Le nettoyage (caractères de contrôle et
--   invisibles retirés, liens et balises refusés) est fait par
--   `utils/tcg/cardDescription.ts`, côté serveur ; le CHECK ne garde que la
--   borne de longueur, filet contre une écriture hors de la route.
--
-- CAVEATS:
--   - Additive et idempotente. Les cartes existantes prennent NULL (pas de
--     description, la carte s'affiche comme avant).
--   - Le code lit la colonne avec un REPLI : tant qu'elle n'existe pas, les
--     écrans fonctionnent comme avant, sans description. Seul
--     l'ENREGISTREMENT d'une description exige la migration (503
--     `migration_pending` sinon).
--   - Rollback : ALTER TABLE public.tcg_fanart_cards
--       DROP CONSTRAINT IF EXISTS tcg_fanart_description_check,
--       DROP COLUMN IF EXISTS description;
--   - NON APPLIQUÉE. À appliquer AVANT `database/seeds/tcg_association_card_arukdo.sql`
--     si l'on passe par le seed (il renseigne la description).

BEGIN;

ALTER TABLE public.tcg_fanart_cards
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.tcg_fanart_cards
  DROP CONSTRAINT IF EXISTS tcg_fanart_description_check;
ALTER TABLE public.tcg_fanart_cards
  ADD CONSTRAINT tcg_fanart_description_check CHECK (
    description IS NULL
    OR (category = 'association' AND char_length(description) BETWEEN 1 AND 280)
  );

COMMENT ON COLUMN public.tcg_fanart_cards.description IS
  'Texte « à propos » d''une carte de l''association, rédigé par le staff (texte brut, ≤ 280). NULL pour les fan arts.';

COMMIT;

NOTIFY pgrst, 'reload schema';
