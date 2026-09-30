-- supabase/migrations/20260930090000_demandes_type_captain_message.sql
--
-- ⚠️  NON APPLIQUÉE EN PRODUCTION. Rejouée par `supabase start` en CI (e2e),
--     donc testée ; à relire puis à appliquer À LA MAIN sur le projet
--     `owwomenscup`. Idempotente : DROP IF EXISTS + ADD, la rejouer ne change
--     rien.
--
-- POURQUOI. Deux écrivains insèrent `type = 'captain_message'` dans `demandes` :
--   - features/player/messages/repository.ts (messagerie entre capitaines) ;
--   - features/admin/tournaments/service/teams.ts (message système
--     « inscriptions ouvertes » aux capitaines).
-- La contrainte ne l'acceptait pas : chaque envoi échouait en 23514 → 500.
-- Relevé exhaustif des `type` insérés par le code (grep des `.insert` sur
-- `demandes`) : join, leave, captain_request, team_registration, transfer,
-- invite, caster_application, scrim, other — tous déjà acceptés —, plus
-- captain_message, le seul manquant.

ALTER TABLE public.demandes DROP CONSTRAINT IF EXISTS demandes_type_check;
ALTER TABLE public.demandes ADD CONSTRAINT demandes_type_check CHECK (
  type = ANY (ARRAY[
    'join'::text,
    'leave'::text,
    'captain_request'::text,
    'team_registration'::text,
    'transfer'::text,
    'invite'::text,
    'caster_application'::text,
    'scrim'::text,
    'other'::text,
    'captain_message'::text
  ])
);
