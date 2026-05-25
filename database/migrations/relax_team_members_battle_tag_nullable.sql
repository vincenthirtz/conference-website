-- Migration: team_members.battle_tag → NULLABLE (Lot 6)
--
-- WHY:
--   Le BattleTag est aujourd'hui obligatoire au moment où une joueuse
--   rejoint une équipe (NOT NULL). En pratique on ne le NÉCESSITE que
--   pour les équipes inscrites à un tournoi Overwatch — une équipe créée
--   pour des scrims internes, du contenu, ou un onboarding "soft" n'a
--   aucun besoin d'un BattleTag valide à la création.
--
--   On relâche la contrainte au niveau DB et on remonte la responsabilité
--   au call site :
--     - `pages/api/teams/create-with-member.ts` exige le BattleTag UNIQUEMENT
--       quand `tournament_id` est présent dans le payload.
--     - Les autres call sites (admin add-member, bot register-user, etc.)
--       acceptent désormais NULL et propagent tel quel — c'est documenté
--       comme un état "à compléter au moment de l'inscription tournoi".
--
-- DEPLOY NOTES:
--   - Idempotent (DROP NOT NULL est no-op si déjà nullable).
--   - Pas de reload du cache PostgREST nécessaire (pas de FK ni RLS touché).
--   - Pas de data fix : les rows existantes ont un battle_tag valide, on
--     n'écrase rien.

ALTER TABLE public.team_members
  ALTER COLUMN battle_tag DROP NOT NULL;

COMMENT ON COLUMN public.team_members.battle_tag IS
  'Lot 6 : NULLABLE depuis 2026-05-25. Requis applicatif quand l''équipe est inscrite à un tournoi Overwatch (cf. /api/teams/create-with-member.ts). Format attendu si fourni : Pseudo#0000.';
