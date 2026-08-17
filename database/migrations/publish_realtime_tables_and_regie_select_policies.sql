-- Migration: publier les tables realtime manquantes + policies SELECT régie
-- Date: 2026-08-17
--
-- WHY:
--   Audit du 2026-08-17 : 15 des 20 souscriptions `postgres_changes` du front
--   portaient sur des tables ABSENTES de la publication `supabase_realtime`.
--   Elles ouvraient donc un canal websocket sans jamais rien recevoir. Deux
--   fonctionnalités n'ont AUCUN filet de polling et étaient de fait sans mise
--   à jour live en production :
--     - le draft pick/ban (`hooks/useDraftState.ts`) : les choix de l'équipe
--       adverse n'apparaissaient pas ;
--     - le cockpit régie (`hooks/useEventRunRealtime.ts`).
--   La migration `add_matches_to_realtime.sql` et
--   `enable_realtime_on_match_drafts.sql` existaient dans le repo mais
--   n'avaient jamais été appliquées (absentes de schema_migrations).
--
-- WHAT — 1. publication :
--   matches, match_drafts, match_draft_steps, demandes, event_runs,
--   event_segments, event_stations, event_waves.
--
-- WHAT — 2. policies SELECT sur les 3 tables régie :
--   `postgres_changes` livre une ligne UNIQUEMENT si le souscripteur a le droit
--   de la SELECT (Realtime applique la RLS du rôle appelant). event_segments,
--   event_stations et event_waves avaient RLS activée et ZÉRO policy : les
--   publier sans policy aurait ajouté du coût WAL pour zéro livraison.
--   On reprend à l'identique le modèle de `add_caster_realtime_select_policies.sql`
--   (event_cues / event_cue_acks / caster_presence) :
--     - `TO authenticated` exclusivement → l'anon reste bloqué ;
--     - scope tenant via `cast_members(auth_user_id, tenant_id, is_active)`,
--       ce qui couvre aussi les admins/owners (fiche `is_internal`
--       auto-provisionnée pour l'accès cockpit) ;
--     - SELECT seulement : aucune policy d'écriture, toutes les mutations
--       restent canalisées par supabaseAdmin via les routes API.
--   Ces 3 tables ne contiennent que de la logistique de diffusion (ordre des
--   segments, noms de stations, vagues horaires) — aucune donnée personnelle.
--
-- HORS PÉRIMÈTRE — support_tickets :
--   La souscription de la navbar admin sur `support_tickets` ne peut pas
--   fonctionner sans une policy SELECT, et cette table porte les signalements
--   de sécurité. Une policy ouvrirait la lecture via l'API REST autant que via
--   Realtime : c'est un arbitrage de sécurité, pas une optimisation. La table
--   n'est donc PAS publiée (la publier sans policy = coût WAL, zéro livraison)
--   et le badge continue de s'appuyer sur son poll 60 s.
--
-- CAVEATS:
--   - Idempotente : blocs DO pour la publication, DROP POLICY IF EXISTS avant
--     chaque CREATE POLICY.
--   - Pas de reload du cache PostgREST : ni table ni FK ajoutée.
--   - `demandes` est publiée mais sa policy SELECT est
--     `auth.uid() = user_id` : PlayerBell s'abonne filtré sur `team_id` pour
--     voir les demandes ENTRANTES d'une équipe, que cette policy ne couvre pas.
--     Le canal restera donc muet pour ce cas d'usage — le poll 90 s continue de
--     l'assurer. Élargir la policy (capitaine → demandes de son équipe) est un
--     chantier à part.
--   - Coût : Realtime est déjà le premier poste CPU de la base
--     (68,7 % du temps cumulé, lecteur WAL). Ces tables l'alourdissent. Les deux
--     souscriptions de la navbar admin sur `matches` sont filtrées côté serveur
--     sur `tournament_id` dans le même lot pour contenir `apply_rls`.

BEGIN;

-- ===========================================================================
-- 1. Publication realtime
-- ===========================================================================
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'matches',
    'match_drafts',
    'match_draft_steps',
    'demandes',
    'event_runs',
    'event_segments',
    'event_stations',
    'event_waves'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = tbl
    ) THEN
      EXECUTE format(
        'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl
      );
    END IF;
  END LOOP;
END $$;

-- ===========================================================================
-- 2. SELECT scope-limitées pour le cockpit régie (modèle event_cues)
-- ===========================================================================
DROP POLICY IF EXISTS event_segments_caster_select ON public.event_segments;
CREATE POLICY event_segments_caster_select
  ON public.event_segments
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT cm.tenant_id
      FROM public.cast_members cm
      WHERE cm.auth_user_id = (SELECT auth.uid())
        AND cm.is_active
    )
  );

DROP POLICY IF EXISTS event_stations_caster_select ON public.event_stations;
CREATE POLICY event_stations_caster_select
  ON public.event_stations
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT cm.tenant_id
      FROM public.cast_members cm
      WHERE cm.auth_user_id = (SELECT auth.uid())
        AND cm.is_active
    )
  );

DROP POLICY IF EXISTS event_waves_caster_select ON public.event_waves;
CREATE POLICY event_waves_caster_select
  ON public.event_waves
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT cm.tenant_id
      FROM public.cast_members cm
      WHERE cm.auth_user_id = (SELECT auth.uid())
        AND cm.is_active
    )
  );

COMMIT;
