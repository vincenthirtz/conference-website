-- Migration: créer la table `custom_game_presets` — presets de partie personnalisée
-- Date: 2026-07-27
--
-- WHY:
--   Overwatch (comme la plupart des jeux d'esport) n'expose AUCUNE API pour créer
--   ou lancer une partie personnalisée : l'hôte doit tout configurer à la main
--   dans le client. Le seul levier automatisable est le **code d'import de partie
--   personnalisée** (le code alphanumérique que le jeu génère depuis
--   « Paramètres > Importer/Exporter »), qui restaure d'un coup règles, cartes,
--   héros interdits, etc.
--   Cette table stocke ce code par périmètre (tenant / tournoi / stage) pour que
--   le site et le bot Discord le poussent automatiquement à l'hôte du match
--   (thread de match, /match-meta). L'hôte n'a plus qu'à coller le code.
--
-- SHAPE:
--   custom_game_presets : un preset = un code d'import + un rappel de la config
--   (nom, description, pool de cartes indicatif). Le périmètre est porté par le
--   couple (tournament_id, stage_id) :
--     - tournament_id NULL, stage_id NULL → preset par défaut du tenant (ce jeu)
--     - tournament_id set, stage_id NULL   → preset du tournoi
--     - tournament_id set, stage_id set    → preset d'une phase précise
--   La résolution côté applicatif prend le plus spécifique qui existe et qui est
--   `enabled` (voir utils/customGamePresets.ts).
--
--   Refs loose (plain uuid, PAS de FK) pour tournament_id / stage_id / created_by
--   — convention du repo (cf. tournament_teams, lobbies). Seul tenant_id est
--   FK-enforced (scoping + cascade).
--
-- UNICITÉ:
--   Un seul preset par (tenant, jeu, périmètre) → index unique sur les colonnes
--   de scope avec COALESCE vers l'uuid nil pour rendre NULL comparable. C'est ce
--   qui rend la résolution déterministe : pas d'arbitrage « lequel des 3 ? ».
--
-- RLS BASELINE:
--   RLS activée, writes service_role uniquement, AUCUNE policy SELECT publique :
--   un code d'import donne accès au lobby, il ne doit jamais fuiter côté anon.
--   Les lectures passent par supabaseAdmin (API admin staff-gated + API bot
--   x-api-key). Un finding get_advisors « RLS enabled, no policy » est ATTENDU.
--
-- DEPLOY NOTES:
--   - Idempotente (IF NOT EXISTS partout, DROP POLICY avant CREATE POLICY).
--   - Nouvelle FK vers tenants → recharger le cache PostgREST après application :
--     NOTIFY pgrst, 'reload schema';

CREATE TABLE IF NOT EXISTS public.custom_game_presets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  game          text NOT NULL DEFAULT 'overwatch',
  tournament_id uuid,
  stage_id      uuid,
  name          text NOT NULL,
  import_code   text NOT NULL,
  description   text,
  map_pool      jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled       boolean NOT NULL DEFAULT true,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Un preset de phase doit forcément appartenir à un tournoi.
  CONSTRAINT custom_game_presets_stage_needs_tournament
    CHECK (stage_id IS NULL OR tournament_id IS NOT NULL),
  CONSTRAINT custom_game_presets_name_not_blank
    CHECK (length(btrim(name)) > 0),
  CONSTRAINT custom_game_presets_import_code_not_blank
    CHECK (length(btrim(import_code)) > 0)
);

COMMENT ON TABLE public.custom_game_presets IS
  'Presets de partie personnalisée : code d''import du jeu + rappel de config, résolus par périmètre (tenant > tournoi > phase). Poussés à l''hôte du match via le site et le bot Discord. Aucune API éditeur ne permet de lancer le lobby — seul le code d''import est automatisable.';
COMMENT ON COLUMN public.custom_game_presets.import_code IS
  'Code d''import de partie personnalisée généré par le jeu (Overwatch : alphanumérique majuscules). Secret de facto : jamais exposé côté anon/public.';
COMMENT ON COLUMN public.custom_game_presets.tournament_id IS
  'Ref loose (pas de FK). NULL = preset par défaut du tenant pour ce jeu.';
COMMENT ON COLUMN public.custom_game_presets.stage_id IS
  'Ref loose (pas de FK). NULL = s''applique à toutes les phases du tournoi.';
COMMENT ON COLUMN public.custom_game_presets.map_pool IS
  'Liste ordonnée de noms de cartes (jsonb array of text), purement indicative pour l''hôte — le pool contraignant reste tournament_maps / tenant_map_pool.';

CREATE INDEX IF NOT EXISTS idx_custom_game_presets_tenant
  ON public.custom_game_presets (tenant_id, game);
CREATE INDEX IF NOT EXISTS idx_custom_game_presets_tournament
  ON public.custom_game_presets (tenant_id, tournament_id);
CREATE INDEX IF NOT EXISTS idx_custom_game_presets_stage
  ON public.custom_game_presets (tenant_id, stage_id);

-- Un seul preset par périmètre exact. COALESCE vers l'uuid nil : en Postgres
-- deux NULL ne sont pas égaux, un index unique naïf laisserait passer N presets
-- « par défaut » et rendrait la résolution non déterministe.
CREATE UNIQUE INDEX IF NOT EXISTS uq_custom_game_presets_scope
  ON public.custom_game_presets (
    tenant_id,
    game,
    COALESCE(tournament_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(stage_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- ===========================================================================
-- RLS : default-deny anon/auth, service_role only.
-- ===========================================================================
ALTER TABLE public.custom_game_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS custom_game_presets_service_role ON public.custom_game_presets;
CREATE POLICY custom_game_presets_service_role
  ON public.custom_game_presets FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Reminder pour l'opérateur :
--   NOTIFY pgrst, 'reload schema';
