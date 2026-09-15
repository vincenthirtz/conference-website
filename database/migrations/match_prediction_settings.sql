-- Migration : préférence d'affichage au classement des pronostiqueuses.
-- Date: 2026-09-16
--
-- WHY. Le classement des pronostics fait apparaître des personnes qui, souvent,
--   ne jouent pas : des spectatrices. Le dépôt a une règle constante — la
--   découverte d'une joueuse est OPT-IN, derrière connexion, jamais un annuaire
--   public (cf. `player_discovery_profiles`, `tcg_showcases`,
--   `tcg_trade_settings`). Un classement qui nommerait tout le monde par défaut
--   la contredirait : on gagne des pièces en silence, on ne devient pas une
--   ligne publique parce qu'on a deviné juste.
--
-- CE QUE LA TABLE PORTE, ET RIEN D'AUTRE : « est-ce que j'accepte d'être NOMMÉE
--   au classement ? ». Les scores, eux, se calculent depuis `match_predictions`.
--   Personne n'est retirée du classement faute d'accord : son rang existe, son
--   nom est remplacé par « Anonyme ». Compter tout le monde garde le classement
--   JUSTE ; nommer sur accord garde la personne libre.
--
-- MÊME FORME QUE `tcg_trade_settings` (tenant + user, défaut `false`) : deux
--   réglages de la même nature se lisent pareil.
--
-- CAVEATS:
--   - Additive et idempotente. RLS activée, service role uniquement.
--   - Rollback : DROP TABLE public.match_prediction_settings (le classement
--     redevient entièrement anonyme).
--   - APPLIQUÉE en production le 2026-09-16.

BEGIN;

CREATE TABLE IF NOT EXISTS public.match_prediction_settings (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  -- Défaut FALSE : le silence n'est pas un accord.
  show_in_leaderboard boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

-- « Qui accepte d'être nommée ici ? » — la lecture du classement.
CREATE INDEX IF NOT EXISTS idx_match_prediction_settings_shown
  ON public.match_prediction_settings (tenant_id)
  WHERE show_in_leaderboard;

ALTER TABLE public.match_prediction_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS match_prediction_settings_service_role
  ON public.match_prediction_settings;
CREATE POLICY match_prediction_settings_service_role
  ON public.match_prediction_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

NOTIFY pgrst, 'reload schema';
