-- Migration: player ratings (Glicko-2) + leagues (saisons multi-tournois)
-- Date: 2026-07-02
--
-- WHY:
--   Deux features liées qui reposent sur les résultats de matchs :
--     1. Un système de classement joueur/équipe façon ladder compétitif
--        (Glicko-2 : rating + rd + volatility par joueur). Le rating équipe
--        est DÉRIVÉ (moyenne du roster courant), pas une source de vérité.
--     2. Des "leagues" : une saison qui agrège plusieurs tournois, attribue
--        des points par classement, et maintient des standings recalculables.
--
--   Ces tables sont écrites par un moteur de scoring server-side (handlers
--   admin + jobs), déclenché à la finalisation d'un match/tournoi. Elles ne
--   sont JAMAIS écrites par un client. La lecture (leaderboard, profil joueur,
--   standings league) se fera via des routes API dédiées qui projettent
--   uniquement les colonnes safe.
--
-- RLS — default deny STRICT (aligné sur event_segments) :
--   - Toutes ces tables ont `ENABLE ROW LEVEL SECURITY` et AUCUNE policy.
--   - Conséquence : anon + authenticated sont totalement bloqués (le moteur
--     Postgres refuse tout SELECT/INSERT/UPDATE/DELETE sans policy). Seul
--     service_role (supabaseAdmin) passe, car il bypass RLS.
--   - Pourquoi pas de SELECT public direct ? player_ratings et
--     player_rating_history contiennent des colonnes dénormalisées (battle_tag,
--     avatar_url, historique fin de rating) qu'on veut projeter/filtrer côté
--     API (masquage, pagination, scoping tenant) plutôt que d'exposer la table
--     brute via Supabase client. L'exposition publique (leaderboard, profil,
--     standings) se fera par des routes API dédiées, pas par accès Supabase
--     client direct. Si un besoin de lecture anon direct apparaît, on ajoutera
--     une policy SELECT ciblée dans une migration ultérieure.
--
-- SCHEMA / CHOIX :
--   - PK uuid gen_random_uuid() partout (aligné tables sœurs).
--   - tenant_id -> tenants(id) ON DELETE RESTRICT (un tenant avec des ratings
--     ne peut pas être supprimé silencieusement ; nettoyage explicite requis).
--   - match_id -> matches(id) ON DELETE CASCADE (si un match est purgé, ses
--     snapshots/historiques de rating disparaissent avec lui).
--   - tournament_id -> tournaments(id) ON DELETE SET NULL (le tournoi peut
--     être supprimé sans détruire l'historique de rating ; on perd juste le
--     rattachement).
--   - team_id -> teams(id) ON DELETE CASCADE (les lignes de rating/standing
--     d'une équipe supprimée n'ont plus de sens).
--   - team_ratings : DÉRIVÉ (moyenne du roster). Recalculé par le moteur ;
--     pas de trigger DB qui le maintient (trop couplé à la logique métier).
--   - league_standings : CACHE recalculable. `rank` est la position calculée
--     dans la league ; recomputé à chaque agrégation.
--
-- CAVEATS:
--   - Idempotente : IF NOT EXISTS partout, DROP TRIGGER IF EXISTS avant CREATE.
--   - Dépendances : doit être appliquée APRÈS l'existence des tables `tenants`,
--     `matches`, `tournaments`, `teams`.
--   - Le moteur de scoring garantit l'invariant tenant_id cohérent (pas de
--     trigger de contrôle DB en V1, comme event_segments).
--   - PostgREST schema cache reload REQUIS (nouvelles tables + nouvelles FK
--     vers matches/tournaments/teams/tenants/leagues). Sans reload, les embeds
--     PostgREST `?select=*,teams(*)` renverront null / "could not find
--     relationship". Le NOTIFY final le déclenche, mais si appliqué hors
--     session PostgREST, cliquer "Reload schema cache" dans le Dashboard.

BEGIN;

-- ===========================================================================
-- 0) Fonction utilitaire updated_at partagée par les tables de cette migration
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.player_ratings_leagues_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ===========================================================================
-- 1) match_participants — snapshot du line-up figé à la fin d'un match
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.match_participants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  match_id       uuid NOT NULL
    REFERENCES public.matches(id) ON DELETE CASCADE,
  tournament_id  uuid
    REFERENCES public.tournaments(id) ON DELETE SET NULL,
  team_id        uuid NOT NULL
    REFERENCES public.teams(id) ON DELETE CASCADE,
  -- team_members.user_id ; NULL si le joueur n'a pas de compte lié au moment
  -- du snapshot (participation off-account, invité, etc.).
  user_id        uuid,
  battle_tag     text,
  role           text,
  is_substitute  boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT match_participants_match_team_user_unique
    UNIQUE (match_id, team_id, user_id)
);

COMMENT ON TABLE public.match_participants IS
  'Snapshot immuable du line-up d''une équipe pour un match donné (figé à la finalisation). Source du calcul de rating.';
COMMENT ON COLUMN public.match_participants.user_id IS
  'team_members.user_id au moment du snapshot. NULL si aucun compte lié (invité / off-account).';
COMMENT ON COLUMN public.match_participants.is_substitute IS
  'true si le joueur figurait comme remplaçant sur ce match (impacte la pondération/éligibilité au rating).';

CREATE INDEX IF NOT EXISTS idx_match_participants_tenant_user
  ON public.match_participants (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_match
  ON public.match_participants (match_id);

ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;
-- Pas de policy : service_role uniquement (supabaseAdmin bypass RLS).

-- ===========================================================================
-- 2) player_ratings — état Glicko-2 courant par joueur (tenant-scopé)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.player_ratings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  user_id        uuid NOT NULL,
  rating         double precision NOT NULL DEFAULT 1500,
  rd             double precision NOT NULL DEFAULT 350,
  volatility     double precision NOT NULL DEFAULT 0.06,
  games_played   integer NOT NULL DEFAULT 0,
  wins           integer NOT NULL DEFAULT 0,
  losses         integer NOT NULL DEFAULT 0,
  draws          integer NOT NULL DEFAULT 0,
  peak_rating    double precision NOT NULL DEFAULT 1500,
  last_match_at  timestamptz,
  -- Colonnes dénormalisées pour l'affichage leaderboard/profil sans JOIN.
  display_name   text,
  battle_tag     text,
  avatar_url     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT player_ratings_tenant_user_unique
    UNIQUE (tenant_id, user_id)
);

COMMENT ON TABLE public.player_ratings IS
  'État courant du rating Glicko-2 par joueur et par tenant. Écrit par le moteur de scoring, lu via API (leaderboard/profil).';
COMMENT ON COLUMN public.player_ratings.rd IS
  'Rating Deviation Glicko-2 : incertitude sur le rating (plus bas = plus fiable). Default 350 (joueur nouveau).';
COMMENT ON COLUMN public.player_ratings.volatility IS
  'Volatilité Glicko-2 (sigma) : mesure de l''irrégularité des performances. Default 0.06.';
COMMENT ON COLUMN public.player_ratings.peak_rating IS
  'Rating maximum jamais atteint par le joueur (jamais décrémenté). Pour badge/vitrine profil.';

-- Hot path leaderboard : classement par rating décroissant, scopé tenant.
CREATE INDEX IF NOT EXISTS idx_player_ratings_tenant_rating
  ON public.player_ratings (tenant_id, rating DESC);

DROP TRIGGER IF EXISTS trg_player_ratings_updated_at ON public.player_ratings;
CREATE TRIGGER trg_player_ratings_updated_at
  BEFORE UPDATE ON public.player_ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.player_ratings_leagues_set_updated_at();

ALTER TABLE public.player_ratings ENABLE ROW LEVEL SECURITY;
-- Pas de policy : service_role uniquement (supabaseAdmin bypass RLS).

-- ===========================================================================
-- 3) player_rating_history — une ligne par match noté et par joueur
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.player_rating_history (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  user_id             uuid NOT NULL,
  match_id            uuid NOT NULL
    REFERENCES public.matches(id) ON DELETE CASCADE,
  tournament_id       uuid
    REFERENCES public.tournaments(id) ON DELETE SET NULL,
  rating_before       double precision NOT NULL,
  rating_after        double precision NOT NULL,
  rd_before           double precision NOT NULL,
  rd_after            double precision NOT NULL,
  volatility_before   double precision NOT NULL,
  volatility_after    double precision NOT NULL,
  opponent_avg_rating double precision,
  result              text NOT NULL
    CHECK (result IN ('win', 'loss', 'draw')),
  -- = matches.completed_at : instant de finalisation du match noté.
  occurred_at         timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT player_rating_history_match_user_unique
    UNIQUE (match_id, user_id)
);

COMMENT ON TABLE public.player_rating_history IS
  'Trace immuable de chaque delta de rating Glicko-2 (avant/après) par joueur et par match noté. Base des courbes de progression.';
COMMENT ON COLUMN public.player_rating_history.opponent_avg_rating IS
  'Moyenne des ratings adverses au moment du match (contexte de la variation). NULL si non calculable.';

-- Hot path courbe de progression joueur : historique chronologique décroissant.
CREATE INDEX IF NOT EXISTS idx_player_rating_history_tenant_user_time
  ON public.player_rating_history (tenant_id, user_id, occurred_at DESC);

ALTER TABLE public.player_rating_history ENABLE ROW LEVEL SECURITY;
-- Pas de policy : service_role uniquement (supabaseAdmin bypass RLS).

-- ===========================================================================
-- 4) team_ratings — rating d'équipe DÉRIVÉ (moyenne du roster courant)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.team_ratings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  team_id       uuid NOT NULL
    REFERENCES public.teams(id) ON DELETE CASCADE,
  rating        double precision NOT NULL DEFAULT 1500,
  rd            double precision,
  games_played  integer NOT NULL DEFAULT 0,
  wins          integer NOT NULL DEFAULT 0,
  losses        integer NOT NULL DEFAULT 0,
  roster_size   integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT team_ratings_tenant_team_unique
    UNIQUE (tenant_id, team_id)
);

COMMENT ON TABLE public.team_ratings IS
  'Rating d''équipe DÉRIVÉ = moyenne du roster courant. Recalculé par le moteur de scoring ; PAS une source de vérité.';
COMMENT ON COLUMN public.team_ratings.rd IS
  'Rating Deviation agrégé du roster (optionnel). NULL si non calculé.';

-- Hot path classement équipes : rating décroissant, scopé tenant.
CREATE INDEX IF NOT EXISTS idx_team_ratings_tenant_rating
  ON public.team_ratings (tenant_id, rating DESC);

DROP TRIGGER IF EXISTS trg_team_ratings_updated_at ON public.team_ratings;
CREATE TRIGGER trg_team_ratings_updated_at
  BEFORE UPDATE ON public.team_ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.player_ratings_leagues_set_updated_at();

ALTER TABLE public.team_ratings ENABLE ROW LEVEL SECURITY;
-- Pas de policy : service_role uniquement (supabaseAdmin bypass RLS).

-- ===========================================================================
-- 5) leagues — saison reliant plusieurs tournois
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.leagues (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name         text NOT NULL,
  slug         text NOT NULL,
  description  text,
  game         text,
  status       text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'finished', 'archived')),
  start_date   date,
  end_date     date,
  points_table jsonb NOT NULL
    DEFAULT '{"1":100,"2":80,"3":60,"4":50,"5":40,"6":30,"7":20,"8":10}'::jsonb,
  is_public    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT leagues_tenant_slug_unique
    UNIQUE (tenant_id, slug)
);

COMMENT ON TABLE public.leagues IS
  'Saison (league) agrégeant plusieurs tournois d''un tenant, avec attribution de points par classement.';
COMMENT ON COLUMN public.leagues.points_table IS
  'Barème de points par rang final de tournoi : { "<rank>": <points> }. Default 8 places (100..10). Consommé par le calcul des standings.';

DROP TRIGGER IF EXISTS trg_leagues_updated_at ON public.leagues;
CREATE TRIGGER trg_leagues_updated_at
  BEFORE UPDATE ON public.leagues
  FOR EACH ROW
  EXECUTE FUNCTION public.player_ratings_leagues_set_updated_at();

ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
-- Pas de policy : service_role uniquement (supabaseAdmin bypass RLS).

-- ===========================================================================
-- 6) league_tournaments — jonction league <-> tournois (avec pondération)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.league_tournaments (
  league_id      uuid NOT NULL
    REFERENCES public.leagues(id) ON DELETE CASCADE,
  tournament_id  uuid NOT NULL
    REFERENCES public.tournaments(id) ON DELETE CASCADE,
  tenant_id      uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  weight         numeric NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT league_tournaments_pkey
    PRIMARY KEY (league_id, tournament_id)
);

COMMENT ON TABLE public.league_tournaments IS
  'Jonction league <-> tournois. Définit quels tournois comptent dans une league et avec quelle pondération.';
COMMENT ON COLUMN public.league_tournaments.weight IS
  'Multiplicateur appliqué aux points du tournoi dans cette league (ex. 2 = tournoi majeur, 0.5 = mineur). Default 1.';

-- Index FK inverse : "dans quelles leagues ce tournoi compte-t-il ?"
CREATE INDEX IF NOT EXISTS idx_league_tournaments_tournament
  ON public.league_tournaments (tournament_id);

ALTER TABLE public.league_tournaments ENABLE ROW LEVEL SECURITY;
-- Pas de policy : service_role uniquement (supabaseAdmin bypass RLS).

-- ===========================================================================
-- 7) league_standings — cache des standings recalculables
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.league_standings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id           uuid NOT NULL
    REFERENCES public.leagues(id) ON DELETE CASCADE,
  tenant_id           uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  team_id             uuid NOT NULL
    REFERENCES public.teams(id) ON DELETE CASCADE,
  points              numeric NOT NULL DEFAULT 0,
  tournaments_counted integer NOT NULL DEFAULT 0,
  best_rank           integer,
  -- Position calculée de l'équipe dans la league (recomputée à chaque agrégation).
  rank                integer,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT league_standings_league_team_unique
    UNIQUE (league_id, team_id)
);

COMMENT ON TABLE public.league_standings IS
  'Cache RECALCULABLE des standings d''une league par équipe. Recomputé par le moteur d''agrégation à partir des résultats de tournois.';
COMMENT ON COLUMN public.league_standings.rank IS
  'Position calculée de l''équipe dans la league (dérivée du tri par points). Recomputée à chaque agrégation.';
COMMENT ON COLUMN public.league_standings.best_rank IS
  'Meilleur rang de tournoi obtenu par l''équipe dans cette league (tie-break / affichage).';

-- Hot path affichage standings : classement par points décroissants dans la league.
CREATE INDEX IF NOT EXISTS idx_league_standings_league_points
  ON public.league_standings (league_id, points DESC);

DROP TRIGGER IF EXISTS trg_league_standings_updated_at ON public.league_standings;
CREATE TRIGGER trg_league_standings_updated_at
  BEFORE UPDATE ON public.league_standings
  FOR EACH ROW
  EXECUTE FUNCTION public.player_ratings_leagues_set_updated_at();

ALTER TABLE public.league_standings ENABLE ROW LEVEL SECURITY;
-- Pas de policy : service_role uniquement (supabaseAdmin bypass RLS).

COMMIT;

-- ===========================================================================
-- 8) PostgREST schema cache reload
-- ===========================================================================

NOTIFY pgrst, 'reload schema';
