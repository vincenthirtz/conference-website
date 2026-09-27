-- Migration: inscription individuelle (« mode solo ») sur un tournoi
-- Date: 2026-09-27
--
-- WHY:
--   Le modèle de compétition est team-only de bout en bout : `tournament_teams`,
--   `stage_teams`, `matches` (team1_id/team2_id) et `lobby_placements` portent
--   tous un `team_id`. Il n'existe aucune notion de participante individuelle,
--   et en introduire une reviendrait à dupliquer tout le moteur.
--
--   Pour un événement ponctuel « chacune pour soi » (soirée à thème, format
--   FFA), la représentation qui coûte le moins est celle qui existe déjà : une
--   équipe d'UNE joueuse. Rien en base ne s'y oppose — `teams` n'exige que
--   `name` + `tenant_id`, `captain_id` est nullable, il n'y a pas de minimum
--   d'effectif (seulement un plafond de 5 via `enforce_team_max_players`), et
--   `tournaments.min_players` ne produit qu'un AVERTISSEMENT à l'ajout en
--   phase, jamais un refus.
--
--   Ce qui manquait n'était donc pas un modèle, mais un DRAPEAU : un moyen de
--   dire « sur ce tournoi, une inscription = une joueuse ». Deux comportements
--   en dépendent, et aucun ne peut se déduire des données existantes :
--
--     1. Discord. Toute création d'équipe par le parcours public émet
--        `team.created`, sur quoi le bot provisionne un rôle + un salon vocal +
--        un salon texte (services/discord-bot/team-voice.js). Trente
--        inscriptions solo = trente rôles et soixante salons sur le serveur.
--        Le drapeau coupe cette émission : une équipe d'une joueuse n'est pas
--        une équipe, elle n'a rien à provisionner.
--
--     2. Le parcours d'inscription. Le wizard /team/create demande un nom
--        d'équipe, un roster et un capitanat — trois questions sans objet ici.
--        Le drapeau aiguille vers /tournament/<id>/inscription-solo.
--
-- CE QUE LA COLONNE NE FAIT PAS:
--   Elle ne change RIEN au moteur de compétition. Les phases, les matchs, le
--   classement FFA et le palmarès continuent de raisonner en équipes — et
--   lisent donc des équipes d'une joueuse, dont le nom est son pseudo. C'est
--   délibéré : aucun consommateur en aval n'a à connaître ce drapeau.
--
-- TENANCY / RLS:
--   Colonne additive NOT NULL avec défaut sur une table qui a déjà sa base RLS.
--   Aucune policy à créer, aucun backfill (les lignes existantes prennent le
--   défaut `false`, qui est bien le comportement historique).
--
-- SCHEMA CACHE:
--   Purement additif (une colonne, pas de FK, pas de relation) → pas de reload
--   du cache PostgREST nécessaire.
--
-- Idempotente (IF NOT EXISTS). Ré-appliquable.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS solo_mode boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN tournaments.solo_mode IS
  'true = inscription individuelle : une participante s''inscrit seule et est représentée par une équipe d''une joueuse (son pseudo). Coupe l''émission de team.created (pas de provisionnement Discord) et aiguille le parcours public vers /tournament/<id>/inscription-solo. N''affecte pas le moteur de compétition, qui continue de raisonner en équipes.';
