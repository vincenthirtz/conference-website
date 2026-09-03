-- Fenêtre de déverrouillage TEMPORAIRE du roster.
--
-- Le verrou vient de `tournaments.roster_locked_at` : passée cette date, plus
-- aucune équipe inscrite au tournoi ne peut toucher son roster. C'est voulu —
-- on ne change pas une composition la veille d'un match.
--
-- Mais il y a les cas légitimes : une joueuse se blesse, une autre arrive, un
-- oubli d'inscription se découvre la veille. Jusqu'ici la seule issue était
-- `force=true`, réservé à l'admin : c'était donc à l'admin de faire la
-- manipulation à la place du capitaine, en devinant qui ajouter. Le capitaine,
-- lui, ne pouvait rien.
--
-- Cette colonne ouvre une fenêtre : tant que `roster_unlocked_until` est dans
-- le futur, le verrou de CE tournoi ne s'applique pas et les capitaines et
-- managers travaillent normalement. Elle se referme SEULE — c'est tout
-- l'intérêt d'une date plutôt que d'un booléen : un déverrouillage oublié
-- redevient un verrou, pas une porte laissée ouverte.
--
-- Ne dispense pas des autres tournois : une équipe inscrite à deux tournois
-- dont un seul est déverrouillé reste verrouillée par l'autre (cf.
-- utils/teams/rosterLock.ts).

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS roster_unlocked_until timestamptz;

COMMENT ON COLUMN public.tournaments.roster_unlocked_until IS
  'Fenêtre de déverrouillage temporaire du roster : tant que la date est dans le futur, roster_locked_at ne verrouille pas. NULL = pas de dérogation.';

NOTIFY pgrst, 'reload schema';
