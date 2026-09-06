-- Rôles Discord attribués selon le classement final — lot 8 de
-- docs/PLAN-plateforme-tournois.md (ticket T3 de BACKLOG-tournois.md).
--
-- POURQUOI UNE COLONNE JSONB ET PAS CINQ COLONNES. « Top 8 » n'est pas un rang,
-- c'est un INTERVALLE, et il change de sens entre un tournoi à 8 équipes et un
-- à 64. Des colonnes `role_1st_id`, `role_2nd_id`, `role_top8_id` figeraient un
-- découpage qui ne vaut que pour un format ; une liste de règles
-- `{from, to, roleId, label}` couvre les deux sans migration à chaque idée.
--
-- LES PLAGES SE CHEVAUCHENT, ET C'EST VOULU : la gagnante mérite « Vainqueure »
-- ET « Top 8 » ET « Participante ». Chaque équipe reçoit tous les rôles dont
-- elle satisfait la plage.
--
-- `to: null` signifie « et tout le reste » — c'est ce qui permet de configurer
-- « Participante » sans connaître le nombre d'inscrites.
--
-- PAS DE CHECK SQL sur la forme. La validation vit dans
-- `utils/discord/placementRoles.ts`, qui doit de toute façon écarter une règle
-- illisible SANS jeter les autres ; un CHECK qui rejette la ligne entière ferait
-- perdre les règles valides à cause d'une faute de frappe sur la dernière.
--
-- Idempotent : re-jouable sans effet.

ALTER TABLE tenant_discord_config
  ADD COLUMN IF NOT EXISTS placement_roles jsonb;

COMMENT ON COLUMN tenant_discord_config.placement_roles IS
  'Règles rang → rôle Discord posées à la finalisation d''un tournoi : [{from, to (null = jusqu''au dernier), roleId, label}]. Validées côté application (utils/discord/placementRoles.ts).';
