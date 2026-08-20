-- Migration: allow_manager_multi_team.sql
-- Date: 2026-08-20
--
-- WHY:
--   `add_team_membership_integrity.sql` a posé la contrainte
--     team_members_tenant_user_key UNIQUE (tenant_id, user_id)
--   pour fermer les courses check-then-insert des flux join/transfer/invite.
--   L'invariant visé était métier : « une JOUEUSE = une seule équipe par
--   tenant ». Mais la contrainte porte sur TOUS les rôles, y compris
--   l'encadrement — et interdit donc à un manager d'encadrer deux équipes.
--
--   Conséquences observées :
--     - `/team/create` en mode manager renvoie « Ce manager appartient déjà à
--       une équipe. » (23505) dès la deuxième équipe ;
--     - un manager ne peut pas être ajouté à une seconde équipe par une
--       capitaine (`/api/teams/add-member`).
--
--   La migration d'origine anticipait cette évolution (section CAVEATS, piste
--   « index partiel »). On l'applique ici, restreinte au seul rôle `manager` :
--   décision produit, le coach reste attaché à une équipe (il consomme du temps
--   de jeu, pas seulement de la gestion).
--
-- WHAT:
--   1. DROP CONSTRAINT team_members_tenant_user_key.
--   2. CREATE UNIQUE INDEX team_members_tenant_user_key
--        ON team_members (tenant_id, user_id) WHERE role IS DISTINCT FROM 'manager'
--      → même nom, même garantie pour tout le monde SAUF les managers.
--
--   Le nom est conservé volontairement : les handlers mappent la 23505 sur
--   « déjà dans une équipe » en lisant le message d'erreur Postgres, qui cite
--   le nom de l'index/contrainte (cf. utils/teams/rpcErrors.ts).
--
-- CE QUI RESTE GARANTI:
--   - UNIQUE (team_id, user_id) : personne n'est deux fois dans la MÊME équipe,
--     manager compris (contrainte distincte, inchangée).
--   - Une joueuse / sub / coach reste dans au plus une équipe par tenant : le
--     prédicat les couvre (role IS DISTINCT FROM 'manager' est vrai pour eux,
--     y compris si role IS NULL).
--   - `enforce_team_max_players()` exclut déjà coach ET manager du quota :
--     un manager multi-équipes ne consomme de place nulle part.
--   - Les RPC approve_join_request / approve_transfer_request /
--     accept_invitation coercent le rôle vers player|substitute|coach : elles
--     ne peuvent pas créer de manager, donc leur invariant est intact.
--
-- CAVEATS:
--   - Idempotente : DROP ... IF EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS.
--   - Postgres ne permet pas de convertir une contrainte en index partiel :
--     il faut drop puis recréer. Fait dans une transaction — aucune fenêtre
--     pendant laquelle l'unicité serait absente.
--   - Pas de reload du schema cache PostgREST : aucune FOREIGN KEY touchée.
--   - Vérifié avant écriture : 0 ligne en doublon (tenant_id, user_id) en base,
--     la recréation passe sans nettoyage.
--   - Rollback : DROP INDEX team_members_tenant_user_key; puis
--     ALTER TABLE team_members ADD CONSTRAINT team_members_tenant_user_key
--       UNIQUE (tenant_id, user_id);
--     (à condition qu'aucun manager multi-équipes n'ait été créé entre-temps).

BEGIN;

-- 1. L'ancienne contrainte globale s'en va (elle emporte son index implicite).
ALTER TABLE public.team_members
  DROP CONSTRAINT IF EXISTS team_members_tenant_user_key;

-- 2. Même garantie, mais l'encadrement `manager` en est exclu.
--    `IS DISTINCT FROM` (et pas `<>`) pour que les lignes à role NULL restent
--    couvertes : `NULL <> 'manager'` vaut NULL, ce qui les sortirait de l'index.
CREATE UNIQUE INDEX IF NOT EXISTS team_members_tenant_user_key
  ON public.team_members (tenant_id, user_id)
  WHERE role IS DISTINCT FROM 'manager';

COMMENT ON INDEX public.team_members_tenant_user_key IS
  'Un compte n''appartient qu''à une seule équipe par tenant — SAUF avec le rôle '
  '`manager`, qui peut encadrer plusieurs équipes (décision produit 2026-08-20). '
  'Remplace la contrainte UNIQUE homonyme de add_team_membership_integrity.sql ; '
  'même nom pour que les handlers continuent de reconnaître la 23505. '
  'L''unicité (team_id, user_id) reste portée par une contrainte séparée.';

COMMIT;
