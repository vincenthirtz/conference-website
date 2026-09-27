-- Migration : « ne plus recevoir de proposition de cette personne ».
-- Date: 2026-09-27
-- Lot T3 de docs/PLAN-tcg.md.
--
-- WHY. Les échanges n'offraient que deux réponses à une sollicitation non
--   désirée : refuser (et subir 24 h de répit avant la suivante), ou couper
--   les échanges POUR TOUT LE MONDE. Entre les deux, il manquait « pas avec
--   elle » — et dans un milieu où les joueuses subissent du harcèlement, c'est
--   le manque le plus sérieux de la fonctionnalité. Le plan le dit ainsi, et
--   ce n'est pas une formule : devoir se couper de tout le monde pour se
--   protéger d'une seule personne, c'est la faire gagner.
--
-- CE QU'UNE PERSONNE BLOQUÉE APPREND : RIEN. Sa proposition est refusée avec
--   `recipient_unavailable`, exactement comme si la destinataire n'acceptait
--   pas les échanges, ou n'existait pas dans cet espace. C'est délibéré et ça
--   vaut la peine d'être écrit : un message « elle t'a bloquée » transforme une
--   protection en information exploitable, et invite la représaille ailleurs.
--   La fonction suit d'ailleurs déjà ce principe pour l'existence d'un compte
--   (« on ne confirme pas qui existe »).
--
-- LE BLOCAGE EST ORIENTÉ. `user_id` bloque `blocked_user_id` : il empêche
--   l'autre de ME solliciter, pas l'inverse. Le rendre réciproque serait plus
--   simple à écrire et faux à l'usage — se protéger de quelqu'un n'est pas
--   renoncer à lui proposer un jour, et surtout ça révélerait le blocage à la
--   première tentative.
--
-- LE REFUS VIT DANS LA FONCTION, pas seulement dans la route. C'est là que
--   vivent tous les autres invariants de l'échange (consentements, plafonds,
--   délai de refus), et une garde de sécurité ne doit pas être la seule à
--   dépendre du chemin emprunté pour l'atteindre.
--
-- RLS : activée, service_role seul en écriture comme le reste du domaine TCG.
--   Les lectures passent par une route qui authentifie la joueuse.
--
-- Idempotente. Rollback : DROP TABLE public.tcg_trade_blocks, et retirer le
-- bloc « 2 bis » de `tcg_propose_trade`.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tcg_trade_blocks (
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Celle qui bloque.
  user_id         uuid NOT NULL,
  -- Celle qui ne pourra plus proposer.
  blocked_user_id uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, blocked_user_id),
  -- Se bloquer soi-même n'a aucun sens et masquerait un bug d'interface.
  CONSTRAINT tcg_trade_blocks_not_self CHECK (user_id <> blocked_user_id)
);

COMMENT ON TABLE public.tcg_trade_blocks IS
  'Blocages d''échange, ORIENTÉS : user_id refuse les propositions de blocked_user_id. La personne bloquée n''en est pas informée — sa proposition reçoit recipient_unavailable, indistinguable d''une destinataire qui n''accepte pas les échanges.';

-- Sens de lecture de la fonction : « qui m'a bloquée ? » depuis la proposante.
CREATE INDEX IF NOT EXISTS idx_tcg_trade_blocks_blocked
  ON public.tcg_trade_blocks (tenant_id, blocked_user_id);

ALTER TABLE public.tcg_trade_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tcg_trade_blocks_service_role ON public.tcg_trade_blocks;
CREATE POLICY tcg_trade_blocks_service_role
  ON public.tcg_trade_blocks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;

-- ===========================================================================
-- `tcg_propose_trade` : le refus, ajouté là où vivent les autres invariants.
-- ===========================================================================
--
-- Seul le bloc « 2 bis » est nouveau ; le reste est repris À L'IDENTIQUE de la
-- version en place (relue depuis `pg_proc`, pas reconstruite de mémoire — une
-- réécriture approximative d'une fonction de 250 lignes qui garde les
-- consentements et les plafonds ferait plus de dégâts que le manque qu'elle
-- comble).
--
-- SA PLACE DANS L'ORDRE compte : juste après les consentements, donc AVANT les
-- plafonds, l'ancienneté et la lecture des cartes. Une personne bloquée ne doit
-- consommer aucun travail, et surtout ne rien apprendre du temps de réponse.
--
-- IL REND `recipient_unavailable`, exactement comme une destinataire qui
-- n'accepte pas les échanges. Cf. l'en-tête : un refus qui se distingue est un
-- refus qui informe.

-- LE PATCH SE FAIT DEPUIS LA DÉFINITION RÉELLE, et non depuis une copie de la
-- fonction recollée ici. Deux raisons, et la seconde est la vraie :
--   1. la fonction fait 250 lignes de consentements, de verrous et de plafonds ;
--      une transcription approximative ferait plus de dégâts que le manque
--      qu'elle comble ;
--   2. ce fichier serait aussitôt périmé. Recopier une fonction, c'est figer
--      l'état d'un jour ; la relire, c'est patcher ce qui tourne vraiment.
--
-- IDEMPOTENT : si la garde est déjà posée, on ne fait rien. L'ancre est
-- vérifiée avant d'écrire — une ancre absente ou ambiguë LÈVE, plutôt que de
-- réécrire une fonction au petit bonheur.

DO $do$
DECLARE
  d text;
  anchor text := '  -- 3) Ancienneté du compte ET de la collection';
  addition text;
  n int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
   WHERE n2.nspname = 'public' AND p.proname = 'tcg_propose_trade';

  IF d IS NULL THEN
    RAISE EXCEPTION 'tcg_propose_trade introuvable';
  END IF;
  IF d LIKE '%tcg_trade_blocks%' THEN
    RETURN; -- déjà posée
  END IF;

  n := (length(d) - length(replace(d, anchor, ''))) / length(anchor);
  IF n <> 1 THEN
    RAISE EXCEPTION 'ancre introuvable ou ambigue (%)', n;
  END IF;

  addition := E'  -- 2 bis) Blocage orienté. Une personne bloquée n''apprend RIEN : meme code\n  --    que ci-dessus, indistinguable d''une destinataire qui n''accepte pas les\n  --    echanges. Un refus qui se distingue est un refus qui informe, et qui\n  --    invite la represaille ailleurs. Place AVANT les plafonds et la lecture\n  --    des cartes : aucun travail consomme, rien a lire dans le temps de\n  --    reponse.\n  IF EXISTS (\n    SELECT 1 FROM public.tcg_trade_blocks\n     WHERE tenant_id = p_tenant_id\n       AND user_id = p_recipient_id\n       AND blocked_user_id = p_proposer_id\n  ) THEN\n    RETURN jsonb_build_object(''status'', ''recipient_unavailable'');\n  END IF;\n\n';

  d := replace(d, anchor, addition || anchor);
  EXECUTE d;
END
$do$;
