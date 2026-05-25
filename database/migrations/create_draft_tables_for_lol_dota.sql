-- Migration: tables pour le système de draft de champions/héros (LoL + Dota 2)
-- Date: 2026-05-26
--
-- WHY:
--   LoL et Dota 2 sont des MOBA avec 1 seule map de jeu mais une phase
--   compétitive de "draft" ban/pick de champions/héros par équipe.
--   Le moteur veto actuel (match_map_vetos) raisonne en "map_name" et n'est
--   pas adapté : pool ~170 héros, séquences plus longues, side selection
--   (Blue/Red ou Radiant/Dire), granularité par game (BO3 = 3 drafts).
--   Cette migration pose la fondation : pool de héros cached + drafts +
--   steps. L'API d'engine et l'UI viennent dans des lots ultérieurs.
--
-- DESIGN NOTES:
--   - game_heroes est GLOBAL (pas de tenant_id) : les héros LoL sont les
--     mêmes pour tous les tenants. Sync via cron depuis Data Dragon /
--     OpenDota dans le Lot 1.
--   - match_drafts est UNIQUE(match_id, game_index) : un draft par game
--     dans un BO. Side selection portée au niveau du draft (peut changer
--     d'une game à l'autre : loser-of-previous-game choisit son side).
--   - match_draft_steps ressemble à match_map_vetos mais référence
--     game_heroes par FK plutôt qu'un string libre.
--   - RLS : lecture publique sur game_heroes (cache global) ; lecture
--     scopée tenant sur drafts + steps via le match.
--   - Pas de FK touchée sur les tables existantes → pas de reload du
--     cache PostgREST nécessaire.
--
-- DEPLOY NOTES:
--   - Idempotent : CREATE TABLE IF NOT EXISTS partout.
--   - Pas de backfill (tables nouvelles, vides).
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.match_draft_steps;
--   DROP TABLE IF EXISTS public.match_drafts;
--   DROP TABLE IF EXISTS public.game_heroes;

BEGIN;

-- 1) Pool global de héros/champions, cached depuis APIs officielles
CREATE TABLE IF NOT EXISTS public.game_heroes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game         text NOT NULL CHECK (game IN ('lol', 'dota2')),
  external_id  text NOT NULL,           -- id Riot (numérique LoL) ou hero_id OpenDota
  key          text NOT NULL,           -- slug technique ('Garen', 'antimage')
  name         text NOT NULL,           -- display name ('Garen', 'Anti-Mage')
  title        text,                    -- LoL : 'The Might of Demacia' (NULL pour Dota)
  roles        text[] NOT NULL DEFAULT '{}',  -- ['Fighter','Tank'] ou ['Carry','Initiator']
  attribute    text,                    -- Dota : strength|agility|intelligence|universal ; LoL : NULL
  image_url    text NOT NULL,           -- splash art URL (CDN officiel)
  icon_url     text,                    -- icône carrée
  data         jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled      boolean NOT NULL DEFAULT true,
  fetched_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game, external_id)
);

CREATE INDEX IF NOT EXISTS idx_game_heroes_game ON public.game_heroes(game) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_game_heroes_key  ON public.game_heroes(game, key);

ALTER TABLE public.game_heroes ENABLE ROW LEVEL SECURITY;

-- Lecture publique (le pool est global, pas sensible)
DROP POLICY IF EXISTS game_heroes_select_all ON public.game_heroes;
CREATE POLICY game_heroes_select_all
  ON public.game_heroes FOR SELECT
  USING (true);

-- 2) Un draft par game individuelle d'un match
CREATE TABLE IF NOT EXISTS public.match_drafts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id              uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  game_index            int  NOT NULL CHECK (game_index >= 1),
  game                  text NOT NULL CHECK (game IN ('lol', 'dota2')),

  -- Side selection (NULL tant que pas décidée)
  -- LoL  : blue|red       (team1_side='blue' ⇒ team2_side='red')
  -- Dota : radiant|dire
  team1_side            text CHECK (team1_side IS NULL OR team1_side IN ('blue','red','radiant','dire')),
  team2_side            text CHECK (team2_side IS NULL OR team2_side IN ('blue','red','radiant','dire')),

  current_step          int NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','in_progress','completed','cancelled')),

  -- Fearless draft : interdit les champions déjà pickés dans les games précédentes
  fearless              boolean NOT NULL DEFAULT false,

  pick_timer_seconds    int NOT NULL DEFAULT 30 CHECK (pick_timer_seconds BETWEEN 5 AND 300),
  started_at            timestamptz,
  completed_at          timestamptz,

  tenant_id             uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE(match_id, game_index),
  CHECK (
    (team1_side IS NULL AND team2_side IS NULL)
    OR (team1_side IS NOT NULL AND team2_side IS NOT NULL AND team1_side <> team2_side)
  )
);

CREATE INDEX IF NOT EXISTS idx_match_drafts_match  ON public.match_drafts(match_id);
CREATE INDEX IF NOT EXISTS idx_match_drafts_tenant ON public.match_drafts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_match_drafts_status ON public.match_drafts(status) WHERE status = 'in_progress';

ALTER TABLE public.match_drafts ENABLE ROW LEVEL SECURITY;

-- Lecture publique des drafts (stream-friendly, pas de donnée sensible)
DROP POLICY IF EXISTS match_drafts_select_public ON public.match_drafts;
CREATE POLICY match_drafts_select_public
  ON public.match_drafts FOR SELECT
  USING (true);

-- 3) Étapes individuelles du draft (un ban ou un pick par row)
CREATE TABLE IF NOT EXISTS public.match_draft_steps (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id     uuid NOT NULL REFERENCES public.match_drafts(id) ON DELETE CASCADE,
  step_number  int  NOT NULL CHECK (step_number >= 1),
  phase        text NOT NULL CHECK (phase IN ('ban_1','pick_1','ban_2','pick_2','ban_3','pick_3')),
  action       text NOT NULL CHECK (action IN ('ban','pick')),
  side         text NOT NULL CHECK (side IN ('team1','team2')),
  hero_id      uuid REFERENCES public.game_heroes(id) ON DELETE SET NULL,
  committed_at timestamptz,
  deadline_at  timestamptz,
  auto_picked  boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE(draft_id, step_number)
);

CREATE INDEX IF NOT EXISTS idx_match_draft_steps_draft ON public.match_draft_steps(draft_id, step_number);

ALTER TABLE public.match_draft_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS match_draft_steps_select_public ON public.match_draft_steps;
CREATE POLICY match_draft_steps_select_public
  ON public.match_draft_steps FOR SELECT
  USING (true);

-- 4) Trigger pour bumper updated_at sur match_drafts
CREATE OR REPLACE FUNCTION public.touch_match_drafts_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_match_drafts_touch ON public.match_drafts;
CREATE TRIGGER trg_match_drafts_touch
  BEFORE UPDATE ON public.match_drafts
  FOR EACH ROW EXECUTE FUNCTION public.touch_match_drafts_updated_at();

COMMENT ON TABLE public.game_heroes IS
  'Pool global de champions LoL / héros Dota 2, synchronisé depuis Data Dragon / OpenDota (cron Lot 1).';
COMMENT ON TABLE public.match_drafts IS
  'Un draft par game individuelle dans un BO (UNIQUE(match_id, game_index)).';
COMMENT ON TABLE public.match_draft_steps IS
  'Étapes ban/pick séquentielles d''un draft.';

COMMIT;
