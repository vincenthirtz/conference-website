-- Migration : surcharges de permissions PAR MEMBRE (lot J3 de
-- docs/PLAN-espace-joueur.md).
--
-- Le problème : les permissions d'équipe sont attachées au RÔLE
-- (`site_settings.team_roles`), et ce réglage est global + staff-only. Confier
-- « les scrims » à quelqu'un imposait donc de lui donner le rôle `coach`, qui
-- porte aussi `validate_lineup` : on ne pouvait pas déléguer une chose sans
-- l'autre, et personne DANS l'équipe ne pouvait rien y changer.
--
-- Cette table ajoute une couche ADDITIVE, décidée par l'équipe elle-même :
--   * une ligne = une permission accordée à un membre, sur une équipe ;
--   * elle ne RETIRE jamais ce que le rôle accorde (pas de « deny ») — sinon
--     deux managers pourraient se neutraliser l'un l'autre ;
--   * la révocation est SOFT (`revoked_at`), pour que la table soit aussi le
--     journal : « qui a donné quoi, à qui, quand » est une question qu'une
--     équipe se pose après coup.
--
-- RLS : service-role uniquement, comme les autres tables lues par les routes.
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS public.team_member_permissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  team_id      UUID NOT NULL,
  user_id      UUID NOT NULL,
  permission   TEXT NOT NULL,
  granted_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at   TIMESTAMPTZ,
  revoked_by   UUID
);

-- Une permission active au plus une fois par (équipe, membre). Index PARTIEL :
-- les lignes révoquées restent en base (journal) sans bloquer un ré-octroi.
CREATE UNIQUE INDEX IF NOT EXISTS team_member_permissions_active_key
  ON public.team_member_permissions (tenant_id, team_id, user_id, permission)
  WHERE revoked_at IS NULL;

-- Lecture chaude : « toutes les surcharges actives de ce compte », faite à
-- chaque résolution d'accès (getManagedTeams).
CREATE INDEX IF NOT EXISTS team_member_permissions_user_idx
  ON public.team_member_permissions (tenant_id, user_id)
  WHERE revoked_at IS NULL;

-- Lecture d'écran : « qui a quoi dans cette équipe », journal compris.
CREATE INDEX IF NOT EXISTS team_member_permissions_team_idx
  ON public.team_member_permissions (tenant_id, team_id);

ALTER TABLE public.team_member_permissions ENABLE ROW LEVEL SECURITY;

COMMIT;
