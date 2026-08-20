-- Migration: team_members_substitute_matches_role.sql
-- Date: 2026-08-21
--
-- WHY:
--   « Remplaçante » était écrit DEUX FOIS sur la même ligne : `role =
--   'substitute'` et `is_substitute = true`. Rien ne les liait — ni contrainte,
--   ni trigger — et l'API laissait bouger le drapeau seul
--   (PATCH /api/teams/update-member avec `is_substitute`).
--
--   Les deux combinaisons contradictoires étaient donc atteignables :
--     - role='player'     + is_substitute=true
--     - role='substitute' + is_substitute=false
--
--   Et les lecteurs ne tranchent pas pareil, ce qui rend la divergence
--   silencieuse plutôt que bruyante :
--     - `splitTeamMembers` (utils/teams/roleKind.ts) classe les remplaçantes
--       sur le DRAPEAU ;
--     - `countPlayingMembers`, le quota `enforce_team_max_players` et la
--       validation BattleTag raisonnent sur le RÔLE.
--   Une même personne pouvait donc être affichée sur le banc et comptée comme
--   titulaire.
--
-- WHAT:
--   Une CHECK qui fait du drapeau une valeur DÉRIVÉE du rôle. La colonne reste
--   (une quinzaine d'écrans la lisent, y compris la page publique d'équipe et
--   le cockpit cast) — c'est son indépendance qui disparaît, pas elle.
--
-- ÉTAT AVANT MIGRATION (vérifié le 2026-08-21, prod) :
--   role='coach'      is_substitute=false   2 lignes
--   role='manager'    is_substitute=false   1 ligne
--   role='player'     is_substitute=false  22 lignes
--   role='substitute' is_substitute=true    4 lignes
--   Aucune ligne en contradiction : la contrainte passe sans nettoyage. C'est
--   précisément pour ça qu'on la pose MAINTENANT — le jour où une divergence
--   existe, il faut d'abord arbitrer laquelle des deux colonnes avait raison,
--   membre par membre.
--
-- CAVEATS:
--   - `coalesce(role, '')` : la colonne est nullable (chk_team_members_role
--     laisse passer NULL, `role = ANY(...)` valant NULL). Sans le coalesce, la
--     CHECK vaudrait NULL sur ces lignes et ne garantirait rien.
--   - Côté application, le drapeau pilote désormais le rôle plutôt que de
--     vivre à côté (cf. pages/api/teams/update-member.ts) : marquer quelqu'un
--     remplaçante le fait passer en `substitute`, le démarquer le ramène en
--     `player`, et un payload qui contredit les deux est refusé en 400.
--   - Rollback : ALTER TABLE public.team_members
--       DROP CONSTRAINT chk_team_members_substitute_matches_role;

BEGIN;

ALTER TABLE public.team_members
  DROP CONSTRAINT IF EXISTS chk_team_members_substitute_matches_role;

ALTER TABLE public.team_members
  ADD CONSTRAINT chk_team_members_substitute_matches_role
  CHECK (is_substitute = (coalesce(role, '') = 'substitute'));

COMMENT ON COLUMN public.team_members.is_substitute IS
  'DÉRIVÉ de `role` : vrai si et seulement si role = ''substitute'' '
  '(chk_team_members_substitute_matches_role). Conservé comme colonne parce '
  'qu''une quinzaine d''écrans le lisent ; ne jamais l''écrire seul.';

COMMIT;
