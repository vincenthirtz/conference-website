-- Migration : map choisie par qui, et bans de héros, pour chaque partie.
-- Date: 2026-09-19
--
-- WHY. À la Cup 2026 la map 1 est imposée, puis l'équipe qui vient de perdre
--   choisit la suivante ; avant chaque map, chaque équipe bannit un héros. Le
--   staff relevait tout ça à la main (message Discord) et rien n'arrivait dans
--   les stats du tournoi.
--
-- POURQUOI SUR `games` ET PAS DANS UNE TABLE À PART. L'écran d'arbitrage
--   enregistre les parties par REMPLACEMENT (DELETE puis INSERT de toutes les
--   parties du match, cf. pages/api/matches/[matchId]/games.ts). Une table
--   rattachée à `games.id` perdrait ses bans à chaque sauvegarde ; stockés sur
--   la ligne, ils font l'aller-retour avec elle.
--
-- POURQUOI PAS `match_map_vetos` POUR LE PICK. Le veto est une séquence faite
--   AVANT le match, avec son propre état (terminé ou non) que l'écran de veto
--   interprète. Un pick décidé en cours de match n'en fait pas partie ; la page
--   publique des maps additionne les deux sources.
--
-- FORMAT DE `hero_bans`. Tableau ordonné `[{ "team_id": uuid, "hero": clé }]`,
--   l'ordre du tableau = l'ordre des bans. `hero` est une clé du manifeste
--   lib/data/ow-heroes.json (ex. « hazard » pour Danger), validée par l'API —
--   la base ne vérifie que la forme.
--
-- CAVEATS:
--   - Additive et idempotente ; défauts neutres (NULL, tableau vide).
--   - Rollback : DROP COLUMN sur les deux colonnes.
--   - APPLIQUÉE en production le 2026-09-19, instantané de schéma régénéré.

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS picked_by_team_id uuid
    REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hero_bans jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'games_hero_bans_is_array'
  ) THEN
    ALTER TABLE public.games
      ADD CONSTRAINT games_hero_bans_is_array
      CHECK (jsonb_typeof(hero_bans) = 'array');
  END IF;
END $$;

COMMENT ON COLUMN public.games.picked_by_team_id IS
  'Équipe qui a choisi cette map (NULL = map imposée ou inconnue).';
COMMENT ON COLUMN public.games.hero_bans IS
  'Bans de héros, dans l''ordre : [{"team_id": uuid, "hero": clé ow-heroes.json}].';
