-- Migration: suppression du rôle STAFF 'manager'
-- Date: 2026-07-16
--
-- WHY:
--   Côté code, le type des rôles staff a été resserré à
--     type StaffRole = 'owner' | 'admin' | 'caster'
--   Le rôle STAFF 'manager' n'existe donc plus dans l'application. Cette
--   migration aligne la base : elle retire 'manager' (ainsi que les rôles
--   historiques 'referee'/'helper' déjà absents du code) de la CHECK
--   constraint de public.staff, et purge les objets DB qui gardaient
--   'manager' comme rôle staff valide.
--
--   /!\ IMPORTANT — NE concerne QUE le rôle STAFF (table public.staff).
--   Le rôle d'ÉQUIPE 'manager' (public.team_members.role) reste parfaitement
--   valide et n'est PAS touché par cette migration.
--
-- CONTEXTE PROD (vérifié le 2026-07-16 via service-role) :
--   - CHECK actuelle = staff_role_check :
--       role IN ('owner','admin','manager','referee','helper','caster')
--     (posée par extend_staff_role_check_caster.sql).
--   - 2 lignes staff avaient role='manager' : uniquement des comptes de test
--     e2e (test-tnot-staff-*@test.local) laissés sur la DB de prod. Aucune
--     ligne 'referee'/'helper'. L'étape (1) les réaligne sur 'admin' avant
--     de resserrer la contrainte.
--   - RLS : VÉRIFIÉ EN PROD (2026-07-16) — AUCUNE policy de la base ne
--     référence le rôle staff 'manager'. La policy historique
--     admin_write_caster_scenes (add_caster_scenes.sql) a été SUPERSEDED : les
--     policies vivantes de caster_scenes (caster_scenes_{select,insert,update,
--     delete}) ne filtrent pas par rôle (juste « staff actif »). On ne touche
--     donc à AUCUNE policy — la recréer changerait le contrôle d'accès réel.
--
-- CAVEATS:
--   - Idempotente : la contrainte finale est toujours la version resserrée ;
--     l'UPDATE de safety est un no-op au second passage (plus aucune ligne
--     'manager').
--   - Pas de FK ajoutée/modifiée, pas de policy touchée ⇒ pas de reload du
--     cache PostgREST requis.
--   - La colonne tenant_discord_config.staff_role_manager_id (mapping Discord
--     -> staff.role='manager') devient vestigiale mais N'est PAS supprimée
--     ici : un DROP COLUMN destructif relève d'une migration dédiée séparée.

BEGIN;

-- 1. Safety : réaligner toute ligne staff résiduelle 'manager' -> 'admin'
--    AVANT de resserrer la contrainte (sinon l'ADD CONSTRAINT échouerait).
--    Normalement 0 ligne en prod hors comptes de test e2e.
UPDATE public.staff
SET role = 'admin'
WHERE role = 'manager';

-- 2. Resserrer la CHECK constraint de public.staff.role.
--    On reprend le nom exact existant : staff_role_check.
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_role_check;

ALTER TABLE public.staff ADD CONSTRAINT staff_role_check
  CHECK (role IN ('caster', 'admin', 'owner'));

COMMIT;

-- NOTES :
--  - Aucune policy RLS ne référence le rôle staff 'manager' en prod (vérifié) :
--    rien à mettre à jour côté RLS.
--  - sync_staff_with_user_roles.sql est une migration de DONNÉES one-shot, pas
--    une fonction/trigger vivante — aucun objet DB à modifier. Le gating des
--    rôles staff valides se fait désormais côté code (StaffRole) + cette CHECK.
--  - La colonne tenant_discord_config.staff_role_manager_id (mapping Discord ->
--    staff.role='manager') devient vestigiale mais N'est PAS supprimée ici
--    (DROP destructif = migration dédiée séparée).
