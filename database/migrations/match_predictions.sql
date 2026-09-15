-- Migration : pronostics sur les matchs de tournoi, payés en pièces TCG.
-- Date: 2026-09-15
--
-- WHY:
--   Une spectatrice choisit, avant le match, l'équipe qu'elle voit gagner. Au
--   résultat, un pronostic juste rapporte `MATCH_PREDICTION_COINS`
--   (`utils/tcg/earnSources.ts`), écrites par `utils/predictions/settle.ts`
--   depuis `applyMatchScore`. Pas de paquet : `tcg_packs` n'est PAS touchée.
--
-- CE N'EST PAS UN PARI, ET LE SCHÉMA LE GARANTIT. On ne mise rien : un
--   pronostic ne coûte aucune pièce, et les pièces ne s'achètent pas
--   (`economy.ts`). Sans mise ni gain monétisable, ce n'est pas un jeu
--   d'argent au sens de l'ANJ. Ajouter une mise en pièces ferait basculer la
--   fonctionnalité : ce serait une décision produit, pas une extension.
--
-- LE VERROU EST DANS LA BASE, PAS DANS L'API. Un pronostic posé une fois le
--   match lancé serait un pronostic sur un résultat en partie connu. L'API le
--   refuse, mais une relecture du match suivie d'une écriture laisse une
--   fenêtre (quatre doublons Discord le 2026-09-12). Le déclencheur
--   `match_predictions_guard` relit le match DANS la transaction d'écriture et
--   refuse :
--     - un match qui n'est plus `pending`, déjà lancé (`started_at`), dont
--       l'heure prévue est passée, supprimé, bye, ou miroir de scrim ;
--     - une équipe qui n'est pas l'une des deux du match.
--   Seul un changement d'équipe (ou une création) est contrôlé : le règlement,
--   qui n'écrit que `result` et `settled_at` APRÈS le match, doit passer.
--   `updated_at` est posé par le déclencheur, jamais par l'appelant.
--
-- UNE FOIS PAR PERSONNE ET PAR MATCH : `UNIQUE (tenant_id, match_id, user_id)`
--   côté pronostics, et `source_ref = <matchId>` côté porte-monnaie, dont la
--   clé `(tenant_id, user_id, source_kind, source_ref)` interdit un second
--   crédit quel que soit le nombre de règlements rejoués.
--
-- ⚠️ UN CHECK SE REMPLACE, IL NE S'AUGMENTE PAS : la liste est recopiée EN
--   ENTIER. Énumérée sur la base réelle le 2026-09-15 :
--     tcg_wallet_entries_source_kind_check (12 valeurs, jusqu'à collection_set),
--     tcg_wallet_entries_amount_check (amount <> 0),
--     tcg_wallet_entries_note_length ;
--   `tcg_packs` (source_kind_check ET source_coherent) n'est pas concernée.
--   Revérifier avant d'appliquer :
--
--     SELECT conrelid::regclass, conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--     WHERE conrelid = 'public.tcg_wallet_entries'::regclass AND contype = 'c';
--
-- ORDRE DE DÉPLOIEMENT :
--   1. appliquer cette migration (additive : une table neuve, un CHECK élargi) ;
--   2. déployer le site (qui déclare `schemaReady: true`).
--   Aucun événement bot nouveau : le gain apparaît dans l'historique du
--   porte-monnaie et sur la carte du match, pas en DM (un DM par match juste
--   serait du bruit).
--
-- CAVEATS:
--   - Idempotente : IF NOT EXISTS, DROP ... IF EXISTS, CREATE OR REPLACE.
--   - Rollback : DROP TABLE public.match_predictions ; DROP FUNCTION
--     public.match_predictions_guard() ; recréer le CHECK à douze valeurs —
--     seulement après avoir supprimé ou requalifié les lignes
--     `match_prediction` du porte-monnaie.
--   - APPLIQUÉE en production le 2026-09-15.

BEGIN;

CREATE TABLE IF NOT EXISTS public.match_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  -- Pas de clé étrangère vers auth.users, comme `tcg_wallet_entries.user_id`.
  user_id uuid NOT NULL,
  -- Contrôlée par le déclencheur (une des deux équipes du match) plutôt que par
  -- une clé étrangère : la vraie règle n'est pas « une équipe existe ».
  predicted_winner_team_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- NULL tant que le match n'est pas réglé. `void` = rien à payer : forfait,
  -- walkover, ou pronostiqueuse finalement sur la feuille de match.
  result text CHECK (result IS NULL OR result IN ('won', 'lost', 'void')),
  settled_at timestamptz,
  CONSTRAINT match_predictions_one_per_user UNIQUE (tenant_id, match_id, user_id),
  CONSTRAINT match_predictions_settlement_coherent CHECK (
    (result IS NULL) = (settled_at IS NULL)
  )
);

-- « Mes pronostics », du plus récent au plus ancien.
CREATE INDEX IF NOT EXISTS idx_match_predictions_user
  ON public.match_predictions (tenant_id, user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.match_predictions_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_match record;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.predicted_winner_team_id IS NOT DISTINCT FROM OLD.predicted_winner_team_id
     AND NEW.match_id = OLD.match_id
     AND NEW.user_id = OLD.user_id THEN
    -- Règlement : seules `result` / `settled_at` bougent. Rien à verrouiller.
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.settled_at IS NOT NULL THEN
    RAISE EXCEPTION 'prediction_locked' USING ERRCODE = 'P0001';
  END IF;

  SELECT m.tenant_id, m.team1_id, m.team2_id, m.status, m.started_at,
         m.scheduled_at, m.deleted_at, m.is_bye, m.scrim_id
    INTO v_match
    FROM public.matches m
   WHERE m.id = NEW.match_id
   FOR SHARE;

  IF NOT FOUND
     OR v_match.tenant_id <> NEW.tenant_id
     OR v_match.deleted_at IS NOT NULL
     OR COALESCE(v_match.is_bye, false)
     OR v_match.scrim_id IS NOT NULL
     OR v_match.team1_id IS NULL
     OR v_match.team2_id IS NULL THEN
    RAISE EXCEPTION 'prediction_not_open' USING ERRCODE = 'P0001';
  END IF;

  IF v_match.status <> 'pending'
     OR v_match.started_at IS NOT NULL
     OR (v_match.scheduled_at IS NOT NULL AND v_match.scheduled_at <= now()) THEN
    RAISE EXCEPTION 'prediction_locked' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.predicted_winner_team_id <> v_match.team1_id
     AND NEW.predicted_winner_team_id <> v_match.team2_id THEN
    RAISE EXCEPTION 'prediction_team_invalid' USING ERRCODE = 'P0001';
  END IF;

  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.result := NULL;
    NEW.settled_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS match_predictions_guard ON public.match_predictions;
CREATE TRIGGER match_predictions_guard
  BEFORE INSERT OR UPDATE ON public.match_predictions
  FOR EACH ROW EXECUTE FUNCTION public.match_predictions_guard();

ALTER TABLE public.match_predictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS match_predictions_service_role ON public.match_predictions;
CREATE POLICY match_predictions_service_role ON public.match_predictions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.tcg_wallet_entries
  DROP CONSTRAINT IF EXISTS tcg_wallet_entries_source_kind_check;

ALTER TABLE public.tcg_wallet_entries
  ADD CONSTRAINT tcg_wallet_entries_source_kind_check
  CHECK (
    source_kind IN (
      'match_win',
      'scrim_win',
      'booster_purchase',
      'admin_grant',
      'card_recycled',
      'twitch_drop',
      'welcome_gift',
      'supporter_welcome',
      'checkin_streak',
      'tournament_placement',
      'battlenet_verified',
      'collection_set',
      -- Pronostic juste. `source_ref` = l'identifiant du match : une fois par
      -- match, par personne et par espace (clé du registre).
      'match_prediction'
    )
  );

COMMIT;

-- Cache de schéma PostgREST : table créée, contrainte modifiée.
NOTIFY pgrst, 'reload schema';
