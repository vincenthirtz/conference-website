-- Migration: team_reviews — mémoire d'équipe sur les matchs et scrims joués
-- Date: 2026-07-31
--
-- WHY (N2 du backlog réseau intelligent, cf. docs/BACKLOG-reseau-intelligent.md) :
--   7 matchs joués en prod, et aucune trace de ce que les équipes en ont tiré :
--   pas de note, pas de VOD, pas de revue. Le seul endroit où une équipe
--   capitalise sur son travail, c'est son Discord — c'est-à-dire AILLEURS. Une
--   plateforme qu'on quitte sans rien perdre est une plateforme qu'on quitte.
--
--   Une revue est donc l'objet qui rend le départ coûteux : c'est le travail de
--   l'équipe, pas la donnée de la plateforme.
--
-- MODÈLE :
--   - POLYMORPHE (`subject_type` + `subject_id`) plutôt que deux tables ou deux
--     colonnes FK nullables : un match et un scrim se revoient exactement de la
--     même façon, et l'historique doit pouvoir les mélanger dans un seul ordre
--     chronologique. Le prix à payer est l'absence de FK sur `subject_id` —
--     assumé : l'API vérifie l'appartenance du sujet à l'équipe avant écriture,
--     et une revue orpheline est inerte (elle n'apparaît que jointe à un sujet).
--   - `opponent_team_id` et `played_at` sont DÉNORMALISÉS depuis le sujet. Ils
--     ne sont jamais fournis par le client : l'API les dérive. C'est ce qui
--     permet de répondre à « qu'avait-on noté contre X ? » en UNE lecture, sans
--     joindre `matches` ET `scrims`.
--   - Une seule revue par (équipe, sujet) : la revue est le document PARTAGÉ de
--     l'équipe, pas un carnet par personne. `updated_by` dit qui a écrit en
--     dernier.
--
-- CONFIDENTIALITÉ : une revue est strictement privée à l'équipe qui l'écrit.
--   Elle n'est exposée par AUCUNE surface publique (fiche d'équipe, annuaire,
--   API publique) — l'adversaire ne doit jamais lire ce qu'on a noté sur lui.
--
-- RLS — default deny STRICT (aligné team_availability / scrim_searches) :
--   ENABLE ROW LEVEL SECURITY + AUCUNE policy → anon et authenticated bloqués.
--   Tout passe par /api/player/team-reviews (service_role), qui vérifie
--   l'appartenance à l'équipe.
--
-- CAVEATS:
--   - Idempotente (IF NOT EXISTS partout, DROP TRIGGER avant CREATE).
--   - Nouvelle table + FK ⇒ reload du schema-cache PostgREST REQUIS (NOTIFY
--     final ; sinon « Reload schema cache » dans le Dashboard).

BEGIN;

CREATE TABLE IF NOT EXISTS public.team_reviews (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  team_id          uuid NOT NULL
    REFERENCES public.teams(id) ON DELETE CASCADE,
  -- Sujet revu : polymorphe, sans FK (cf. en-tête).
  subject_type     text NOT NULL,
  subject_id       uuid NOT NULL,
  -- Dérivés du sujet par l'API, jamais fournis par le client.
  opponent_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  played_at        timestamptz,
  vod_url          text,
  notes            text,
  created_by       uuid,
  updated_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_reviews_subject_type_check
    CHECK (subject_type IN ('match', 'scrim')),
  CONSTRAINT team_reviews_vod_len
    CHECK (vod_url IS NULL OR length(vod_url) <= 500),
  CONSTRAINT team_reviews_notes_len
    CHECK (notes IS NULL OR length(notes) <= 4000),
  -- Une revue vide n'a aucune raison d'exister : l'API supprime la ligne quand
  -- les deux champs sont vidés, et la base le garantit.
  CONSTRAINT team_reviews_not_empty
    CHECK (vod_url IS NOT NULL OR notes IS NOT NULL)
);

COMMENT ON TABLE public.team_reviews IS
  'Revue PRIVÉE d''une équipe sur un match ou un scrim joué (VOD + notes). Strictement invisible de l''adversaire et de toute surface publique.';
COMMENT ON COLUMN public.team_reviews.subject_id IS
  'Id du match ou du scrim. Pas de FK : le sujet est polymorphe. L''API verifie l''appartenance avant ecriture.';
COMMENT ON COLUMN public.team_reviews.opponent_team_id IS
  'Denormalise depuis le sujet par l''API — permet « qu''avait-on note contre X ? » en une seule lecture.';

-- Une revue par équipe et par sujet : c'est le document partagé de l'équipe.
CREATE UNIQUE INDEX IF NOT EXISTS team_reviews_team_subject_uniq
  ON public.team_reviews (team_id, subject_type, subject_id);

-- Historique chronologique de l'équipe (lecture principale).
CREATE INDEX IF NOT EXISTS team_reviews_team_played_idx
  ON public.team_reviews (tenant_id, team_id, played_at DESC);

-- « Contre cet adversaire » — le geste que la feature doit rendre instantané.
CREATE INDEX IF NOT EXISTS team_reviews_team_opponent_idx
  ON public.team_reviews (team_id, opponent_team_id);

CREATE OR REPLACE FUNCTION public.team_reviews_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_team_reviews_updated_at ON public.team_reviews;
CREATE TRIGGER trg_team_reviews_updated_at
  BEFORE UPDATE ON public.team_reviews
  FOR EACH ROW EXECUTE FUNCTION public.team_reviews_set_updated_at();

-- RLS : default deny strict, aucune policy (service_role uniquement).
ALTER TABLE public.team_reviews ENABLE ROW LEVEL SECURITY;

COMMIT;

NOTIFY pgrst, 'reload schema';
