-- database/migrations/add_tcg_map_cards.sql
--
-- Les MAPS deviennent un troisième sujet de carte, à côté des joueuses et des
-- équipes.
--
-- POURQUOI UN SLUG ET PAS UNE CLÉ ÉTRANGÈRE. Les maps ne vivent pas dans une
-- table : elles sont un registre TypeScript (`config/maps/overwatch.ts`), parce
-- qu'Overwatch n'expose aucune API de maps et que les maquettes voxel sont
-- pré-rendues au build. La base ne peut donc RIEN garantir sur la validité d'un
-- slug — pas de REFERENCES, pas de CHECK d'appartenance. C'est le code qui tire
-- les cartes qui tient cette règle, contre le registre unique, exactement comme
-- l'API des préférences de héros valide les noms de héros contre le sien. Dit
-- ici pour qu'on ne croie pas à une intégrité que ce schéma n'assure pas.
--
-- LES DEUX CONTRAINTES SONT REFAITES, PAS SEULEMENT LA PREMIÈRE. `subject_kind`
-- porte un CHECK d'énumération (nommé automatiquement par Postgres :
-- `tcg_pack_cards_subject_kind_check` — nom relevé en base, pas deviné), ET un
-- second CHECK nommé `tcg_pack_cards_subject_exclusif` exige qu'exactement une
-- colonne de sujet soit renseignée. Élargir le premier sans le second aurait
-- rendu toute carte de map impossible à insérer, l'exclusif n'admettant aucune
-- ligne dont `subject_kind` vaut 'map'.
--
-- ADDITIVE ET REJOUABLE. Les lignes existantes ont `card_map_slug` NULL et
-- satisfont les branches 'player'/'team' telles qu'elles étaient : la
-- revalidation des CHECK sur la table existante ne peut pas échouer.

-- 1) La colonne D'ABORD : le CHECK exclusif la référence ci-dessous.
ALTER TABLE public.tcg_pack_cards
  ADD COLUMN IF NOT EXISTS card_map_slug text;

-- 2) L'énumération des sujets.
ALTER TABLE public.tcg_pack_cards
  DROP CONSTRAINT IF EXISTS tcg_pack_cards_subject_kind_check;
ALTER TABLE public.tcg_pack_cards
  ADD CONSTRAINT tcg_pack_cards_subject_kind_check
  CHECK (subject_kind IN ('player', 'team', 'map'));

-- 3) EXACTEMENT un sujet renseigné, cohérent avec `subject_kind`. Sans cette
--    contrainte, une carte pourrait n'avoir aucun sujet (invisible) ou deux
--    (ambiguë) — deux états qu'aucun code d'affichage ne saurait traiter.
ALTER TABLE public.tcg_pack_cards
  DROP CONSTRAINT IF EXISTS tcg_pack_cards_subject_exclusif;
ALTER TABLE public.tcg_pack_cards
  ADD CONSTRAINT tcg_pack_cards_subject_exclusif CHECK (
    (subject_kind = 'player'
      AND card_user_id IS NOT NULL
      AND card_team_id IS NULL
      AND card_map_slug IS NULL)
    OR
    (subject_kind = 'team'
      AND card_team_id IS NOT NULL
      AND card_user_id IS NULL
      AND card_map_slug IS NULL)
    OR
    (subject_kind = 'map'
      AND card_map_slug IS NOT NULL
      AND card_user_id IS NULL
      AND card_team_id IS NULL)
  );

-- 4) « Qui possède des cartes de telle map ». Index PARTIEL, comme ses deux
--    voisins : la colonne est NULL sur toutes les cartes de joueuse et d'équipe.
CREATE INDEX IF NOT EXISTS idx_tcg_pack_cards_card_map
  ON public.tcg_pack_cards (card_map_slug)
  WHERE card_map_slug IS NOT NULL;

-- PostgREST met son cache de schéma à jour, sinon la nouvelle colonne reste
-- invisible à l'API jusqu'au prochain redémarrage.
NOTIFY pgrst, 'reload schema';
