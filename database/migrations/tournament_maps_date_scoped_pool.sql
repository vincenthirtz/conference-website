-- Pool de cartes par DATE DE JEU d'un tournoi.
-- Date: 2026-09-17
--
-- WHY:
--   `tournament_maps_round_scoped_pool.sql` a indexé le pool sur la JOURNÉE
--   (`round_number`), en écartant la date parce qu'une même date porte
--   plusieurs journées. Mais l'organisation publie ses pools PAR DATE (visuel
--   « Map Pool 30/09 ») et le 30/09 réunit justement des matchs J2 et J3 :
--   aucun pool de journée ne peut le représenter sans écraser les autres dates
--   de ces journées (J2 se joue aussi le 23/09, le 25/09 et le 16/10).
--
--   On ajoute donc une clé DATE, prioritaire : un match prend le pool de sa
--   date de jeu (jour calendaire à Paris de `matches.scheduled_at`), sinon celui
--   de sa journée, sinon le pool par défaut du tournoi. La journée reste utile
--   quand un pool couvre toute une journée étalée sur plusieurs dates.
--
-- RÈGLES:
--   - `play_date` NULL et `round_number` NULL  = pool par défaut (inchangé) ;
--   - `round_number` renseigné                  = pool d'une journée (inchangé) ;
--   - `play_date` renseignée                    = pool d'une date.
--   Une ligne ne porte jamais les deux clés : un pool est soit d'une journée,
--   soit d'une date (CHECK).
--
-- COMPATIBILITÉ:
--   Additive. Les lignes existantes ont `play_date` NULL et gardent leur sens.
--   ATTENTION : tant que le code ne filtre pas `play_date IS NULL` pour le pool
--   par défaut, n'insérer AUCUNE ligne datée — elle apparaîtrait dans le pool
--   par défaut. Le code et les données arrivent donc dans cet ordre :
--   migration → déploiement du code → saisie des pools datés.
--
-- Idempotente : re-jouable sans effet de bord.
-- Rollback : DROP INDEX tournament_maps_unique_per_scope_idx; recréer
--   tournament_maps_unique_per_round_idx (cf. la migration de journée) ;
--   ALTER TABLE public.tournament_maps DROP CONSTRAINT tournament_maps_one_scope,
--   DROP COLUMN play_date;

BEGIN;

ALTER TABLE public.tournament_maps
  ADD COLUMN IF NOT EXISTS play_date date;

COMMENT ON COLUMN public.tournament_maps.play_date IS
  'Date de jeu (jour calendaire Europe/Paris) à laquelle ce pool s''applique. Prioritaire sur round_number. NULL = pas un pool daté.';

ALTER TABLE public.tournament_maps
  DROP CONSTRAINT IF EXISTS tournament_maps_one_scope;
ALTER TABLE public.tournament_maps
  ADD CONSTRAINT tournament_maps_one_scope CHECK (
    play_date IS NULL OR round_number IS NULL
  );

-- L'unicité devient « une carte une fois par pool », le pool étant identifié
-- par (journée, date). NULLS NOT DISTINCT, comme avant, pour que le pool par
-- défaut (deux NULL) refuse aussi les doublons. L'ancien index (sans la date)
-- interdirait d'avoir Busan dans le pool par défaut ET dans un pool daté.
CREATE UNIQUE INDEX IF NOT EXISTS tournament_maps_unique_per_scope_idx
  ON public.tournament_maps (tenant_id, tournament_id, round_number, play_date, map_name)
  NULLS NOT DISTINCT;
DROP INDEX IF EXISTS public.tournament_maps_unique_per_round_idx;

-- Lecture type : « le pool du 30/09 de ce tournoi ».
CREATE INDEX IF NOT EXISTS tournament_maps_tournament_date_idx
  ON public.tournament_maps (tenant_id, tournament_id, play_date, order_index)
  WHERE play_date IS NOT NULL;

COMMIT;
