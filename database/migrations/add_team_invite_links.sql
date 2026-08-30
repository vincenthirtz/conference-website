-- Migration: add_team_invite_links.sql
-- Date: 2026-08-30
--
-- WHY:
--   Recruter passe aujourd'hui par l'EMAIL : `POST /api/teams/invitations`
--   exige une adresse, crée le compte auth à la volée, envoie un mail, et rend
--   un « lien privé » — mais ce lien reste NOMINATIF (il est rattaché à
--   l'invitation d'UNE personne, cf. `payload.invite_token_hash`).
--
--   Sur le terrain, une capitaine ou un manager recrute dans un vocal Discord :
--   elle n'a pas l'email, la personne est là, tout de suite. Il lui faut un lien
--   qu'elle colle dans le salon et que la nouvelle ouvre pour s'inscrire
--   elle-même au roster. C'est l'objet de cette table.
--
-- WHAT:
--   Une table `team_invite_links` : au plus UN lien actif par équipe (index
--   unique partiel), régénérable, révocable, borné dans le temps et en nombre
--   d'usages.
--
--   Le jeton n'est JAMAIS stocké en clair — seul son SHA-256 vit ici, comme
--   pour le lien nominatif (utils/teams/inviteLinks.ts). Il est affiché une
--   seule fois à sa créatrice ; le perdre = en régénérer un (ce qui révoque le
--   précédent).
--
-- MODÈLE DE SÉCURITÉ (identique au lien nominatif) :
--   - le lien N'AUTHENTIFIE PAS : il ouvre une page publique qui décrit
--     l'équipe, puis EXIGE une session. Un lien qui fuite ne donne jamais accès
--     à un compte ;
--   - il ne peut faire entrer quelqu'un que dans l'équipe désignée, avec le
--     rôle figé à la création — impossible de s'auto-promouvoir manager ;
--   - `uses_count` est incrémenté par un UPDATE CONDITIONNEL (« réserver un
--     siège ») avant l'ajout au roster : deux personnes qui cliquent en même
--     temps sur un lien à usage unique ne peuvent pas entrer toutes les deux.
--
-- CAVEATS:
--   - RLS activée SANS policy : service_role uniquement. Tous les accès passent
--     par les handlers (`/api/teams/invite-links*`), qui portent les gardes
--     métier (permission `manage_roster`, roster lock, quota d'équipe). Une
--     policy `anon` serait un aveu : le hash suffirait à énumérer les équipes.
--   - `role` n'a pas de CHECK : la liste des rôles d'équipe vit en base
--     (`team_roles`, cf. utils/teamRoles.ts) et évolue sans migration. La
--     validation est côté API, comme pour `demandes.payload.desired_role`.
--   - Reload du schema cache PostgREST requis : nouvelles FK (tenants, teams,
--     auth.users). NOTIFY en fin de migration.
--   - Idempotente : IF NOT EXISTS partout, DROP POLICY avant CREATE.
--   - Rollback : DROP TABLE public.team_invite_links;

BEGIN;

CREATE TABLE IF NOT EXISTS public.team_invite_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  -- SHA-256 hexadécimal (64 caractères) du jeton base64url.
  token_hash text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'player',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  -- NULL = pas de plafond ; sinon, nombre d'entrées autorisées.
  max_uses integer CHECK (max_uses IS NULL OR max_uses > 0),
  uses_count integer NOT NULL DEFAULT 0 CHECK (uses_count >= 0),
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- « Un lien privé et UNIQUE » : au plus un lien vivant par équipe. Régénérer
-- révoque le précédent (le handler POST fait révocation puis insertion dans la
-- foulée), donc un lien diffusé hier cesse de fonctionner dès qu'on en refait
-- un — c'est le bouton « révoquer » du pauvre, et c'est voulu.
CREATE UNIQUE INDEX IF NOT EXISTS team_invite_links_active_per_team
  ON public.team_invite_links (tenant_id, team_id)
  WHERE revoked_at IS NULL;

-- Le chemin chaud : résoudre un jeton présenté par un visiteur.
CREATE INDEX IF NOT EXISTS idx_team_invite_links_token_hash
  ON public.team_invite_links (token_hash);

COMMENT ON TABLE public.team_invite_links IS
  'Lien d''auto-inscription au roster d''une équipe, sans passer par l''email. Jeton stocké hashé (SHA-256). Service-role only.';
COMMENT ON COLUMN public.team_invite_links.token_hash IS
  'SHA-256 hex du jeton. Le jeton en clair n''est montré qu''une fois, à la création.';
COMMENT ON COLUMN public.team_invite_links.max_uses IS
  'NULL = illimité jusqu''à expiration. 1 = lien à usage unique.';
COMMENT ON COLUMN public.team_invite_links.uses_count IS
  'Sièges consommés. Incrémenté par UPDATE conditionnel AVANT l''ajout au roster, et décrémenté si l''ajout échoue.';

ALTER TABLE public.team_invite_links ENABLE ROW LEVEL SECURITY;

-- Aucune policy : service_role uniquement (cf. CAVEATS). On retire une
-- éventuelle policy laissée par une application antérieure de la migration.
DROP POLICY IF EXISTS team_invite_links_select_public ON public.team_invite_links;

COMMIT;

-- PostgREST doit revoir son cache : nouvelles FK.
NOTIFY pgrst, 'reload schema';
