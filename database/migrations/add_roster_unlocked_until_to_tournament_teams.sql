-- Dérogation de roster PAR ÉQUIPE.
--
-- `tournaments.roster_unlocked_until` ouvre une fenêtre pour TOUTES les équipes
-- d'un tournoi. C'est le bon outil quand la raison est collective (report,
-- annonce tardive du format). Ce n'en est pas un quand la raison tient à une
-- seule équipe : « une joueuse s'est blessée chez les Alpha » n'est pas un
-- motif pour rouvrir le roster de tout le monde la veille des matchs.
--
-- Cette colonne porte la dérogation là où la décision se prend : sur
-- l'inscription d'une équipe à un tournoi. L'écran d'édition d'équipe s'en
-- sert ; le tableau de bord du tournoi garde la fenêtre collective.
--
-- Les deux se cumulent, au sens le plus permissif : une équipe est libre si SA
-- fenêtre est ouverte OU si celle du tournoi l'est. Et comme les deux sont des
-- dates, elles se referment seules.

ALTER TABLE public.tournament_teams
  ADD COLUMN IF NOT EXISTS roster_unlocked_until timestamptz;

COMMENT ON COLUMN public.tournament_teams.roster_unlocked_until IS
  'Fenêtre de déverrouillage du roster pour CETTE équipe sur CE tournoi. Se cumule avec tournaments.roster_unlocked_until (le plus permissif gagne). NULL = pas de dérogation.';

NOTIFY pgrst, 'reload schema';
