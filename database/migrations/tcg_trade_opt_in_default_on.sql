-- Migration: échanges de cartes ACTIVÉS PAR DÉFAUT (opt-in → opt-out).
-- Date: 2026-10-12
--
-- WHY:
--   À la demande de l'organisation : avec un opt-in, 61 collectionneuses sur 64
--   n'avaient aucune ligne `tcg_trade_settings`, donc n'étaient pas
--   sollicitables, et la fonctionnalité restait quasi vide.
--
--   Les fonctions SQL (`tcg_propose_trade`, accepte…) et la liste des
--   partenaires exigent une LIGNE `accepts_proposals = true` : « pas de ligne »
--   vaut « non ». Plutôt que de réécrire ces fonctions pour inverser ce sens,
--   la base CRÉE la ligne :
--     1. défaut de colonne à true ;
--     2. rattrapage : une ligne `true` pour chaque collectionneuse (au moins un
--        paquet) qui n'en a pas ;
--     3. trigger : la ligne naît au PREMIER paquet d'une nouvelle collectionneuse.
--
-- UN « NON » EXPLICITE RESTE UN NON. Une ligne existante n'est jamais
-- modifiée (ON CONFLICT DO NOTHING). Au 2026-10-12 : 3 lignes, toutes à true.
--
-- L'ANCIENNETÉ RESTE LA GARDE. Activée d'office, une joueuse dont le compte a
-- moins de 14 jours ou la collection moins de 7 n'est pas sollicitable pour
-- autant : `tcg_propose_trade` revérifie `tcg_trade_eligibility` pour la
-- destinataire (réponse `recipient_unavailable`).
--
-- CAVEATS:
--   - Idempotente (CREATE OR REPLACE, DROP TRIGGER IF EXISTS, ON CONFLICT).
--   - Retour arrière : DROP TRIGGER + ALTER … SET DEFAULT false. Les lignes
--     créées restent (elles valent un « oui ») : les supprimer seulement pour
--     les joueuses qui n'ont jamais touché au réglage (updated_at = celui du
--     rattrapage).

BEGIN;

ALTER TABLE public.tcg_trade_settings
  ALTER COLUMN accepts_proposals SET DEFAULT true;

INSERT INTO public.tcg_trade_settings (tenant_id, user_id, accepts_proposals, updated_at)
SELECT DISTINCT p.tenant_id, p.user_id, true, now()
  FROM public.tcg_packs p
ON CONFLICT (tenant_id, user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.tcg_trade_settings_default_on_first_pack()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.tcg_trade_settings (tenant_id, user_id, accepts_proposals, updated_at)
  VALUES (NEW.tenant_id, NEW.user_id, true, now())
  ON CONFLICT (tenant_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tcg_trade_settings_default_on_first_pack() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.tcg_trade_settings_default_on_first_pack() IS
  'Échanges activés par défaut : crée la ligne tcg_trade_settings (true) au premier paquet. Ne modifie jamais une ligne existante (un « non » explicite reste un non).';

DROP TRIGGER IF EXISTS trg_tcg_trade_settings_default_on ON public.tcg_packs;
CREATE TRIGGER trg_tcg_trade_settings_default_on
  AFTER INSERT ON public.tcg_packs
  FOR EACH ROW
  EXECUTE FUNCTION public.tcg_trade_settings_default_on_first_pack();

COMMIT;
