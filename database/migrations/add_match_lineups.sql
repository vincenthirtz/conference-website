-- Migration: add_match_lineups.sql
-- Date: 2026-08-21
--
-- WHY:
--   « Qui a joué ce match ? » n'avait pas de réponse. `match_participants`
--   existait déjà, mais était rempli APRÈS coup par
--   `snapshotMatchParticipants` (utils/rating/applyMatchRating.ts), qui fige le
--   ROSTER COURANT des deux équipes au moment où le score est saisi — son
--   propre commentaire parle d'« approximation assumée ».
--
--   Conséquences : une remplaçante restée sur le banc reçoit le même
--   ajustement de rating qu'une titulaire qui a joué les cinq cartes ; une
--   joueuse arrivée dans l'équipe APRÈS le match se voit attribuer un match
--   qu'elle n'a pas joué ; et rien ne permet de contester une composition,
--   puisqu'elle n'a jamais été déclarée.
--
--   Le drapeau `is_substitute` ne comblait pas ce trou : il est déclaratif au
--   niveau de l'équipe (« untel est remplaçant en général »), pas au niveau du
--   match (« untel n'a pas joué CELUI-CI »).
--
-- WHAT:
--   L'EN-TÊTE de la feuille de match : une ligne par (match, équipe), qui porte
--   son état et sa validation. Les LIGNES restent `match_participants`, dont la
--   contrainte UNIQUE (match_id, team_id, user_id) est déjà en place.
--
--   Cycle de vie :
--     - la feuille s'ouvre quand l'équipe a fait son CHECK-IN
--       (`matches.teamN_checked_in_at`) — avant, la composition n'a pas de sens
--       puisque la présence n'est pas acquise ;
--     - le staff de l'équipe (permission `validate_lineup`) compose puis
--       valide ;
--     - un admin peut valider à la place (`validated_by_kind = 'admin'`) : le
--       jour du tournoi, une équipe injoignable ne doit pas bloquer la suite.
--
--   `validated_by_kind` distingue les deux : une feuille validée par l'équipe
--   engage l'équipe, une feuille validée par le staff engage l'organisation.
--   Confondre les deux rendrait toute contestation ininterprétable.
--
-- CE QUI NE CHANGE PAS:
--   - `match_participants` garde sa forme et ses lecteurs (rating, H2H).
--   - `snapshotMatchParticipants` reste le repli pour les équipes SANS feuille
--     validée — il ne doit simplement plus écraser celles qui en ont une
--     (garde côté application).
--
-- CAVEATS:
--   - Idempotente (IF NOT EXISTS).
--   - RLS activée sans policy : service_role uniquement, comme les autres
--     tables écrites par les routes serveur.
--   - Pas de FK composite vers match_participants : l'en-tête peut exister
--     alors que la composition est encore vide (feuille ouverte, pas remplie).

BEGIN;

CREATE TABLE IF NOT EXISTS public.match_lineups (
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  match_id uuid NOT NULL REFERENCES public.matches (id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  validated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  validated_by_kind text,
  validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, team_id),
  CONSTRAINT chk_match_lineups_status
    CHECK (status IN ('draft', 'validated')),
  CONSTRAINT chk_match_lineups_validated_by_kind
    CHECK (validated_by_kind IS NULL OR validated_by_kind IN ('team', 'admin')),
  -- Une feuille validée porte TOUJOURS qui l'a validée et quand : sans ça,
  -- « validée » ne serait qu'une étiquette, inutilisable en cas de litige.
  CONSTRAINT chk_match_lineups_validation_complete CHECK (
    (status = 'validated'
      AND validated_at IS NOT NULL
      AND validated_by_kind IS NOT NULL)
    OR (status <> 'validated'
      AND validated_at IS NULL
      AND validated_by_kind IS NULL)
  )
);

COMMENT ON TABLE public.match_lineups IS
  'En-tête de feuille de match : une ligne par (match, équipe). Les joueuses '
  'alignées vivent dans match_participants. S''ouvre au check-in de l''équipe, '
  'se valide par le staff de l''équipe ou par un admin.';

COMMENT ON COLUMN public.match_lineups.validated_by_kind IS
  '« team » = validée par le staff de l''équipe (elle s''engage) ; « admin » = '
  'validée par l''organisation à sa place. Les confondre rendrait toute '
  'contestation ininterprétable.';

-- Lecture typique : « les feuilles de ce match » (les deux équipes), couverte
-- par le préfixe de la PK. On indexe l'autre sens pour « les feuilles de cette
-- équipe » (historique d'une équipe).
CREATE INDEX IF NOT EXISTS idx_match_lineups_team
  ON public.match_lineups (team_id, tenant_id);

ALTER TABLE public.match_lineups ENABLE ROW LEVEL SECURITY;

COMMIT;
