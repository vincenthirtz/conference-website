-- database/migrations/add_tournament_pooled_teams.sql
-- Inscription INDIVIDUELLE regroupée en équipes (« pool ») — lot 1.
-- Date: 2026-09-27
--
-- WHY:
--   Pour un événement ponctuel en 5v5 (le premier : Halloween 2026), chaque
--   joueuse s'inscrit SEULE, puis :
--     - dès que 5 membres d'une même équipe sont inscrites, l'équipe est
--       inscrite au tournoi avec ces 5-là ;
--     - sinon — équipe incomplète, ou pas d'équipe du tout — la joueuse part
--       en liste d'attente, que le staff répartit ensuite en équipes (lot 2).
--
--   Pourquoi pas `solo_mode` : lui représente chaque participante par une
--   équipe d'UNE joueuse (FFA). Ici on veut des équipes de 5, formées soit par
--   l'équipe réelle, soit par le staff.
--
-- LA COMPOSITION DE L'ÉVÉNEMENT VIT ICI, PAS DANS `team_members`.
--   Une joueuse placée pour la soirée dans une autre équipe que la sienne ne
--   doit PAS quitter sa vraie équipe : `team_members` pilote la synchro des
--   rôles Discord (role-sync), qui lui retirerait son rôle d'équipe. Et une
--   équipe de 8 inscrite avec 5 d'entre elles n'a pas à perdre les 3 autres.
--   `tournament_pool_entries.placed_team_id` dit donc qui joue OÙ ce soir-là,
--   sans toucher aux rosters permanents.
--
-- ATOMICITÉ.
--   Le seuil « 5 d'une même équipe » se franchit à une inscription précise.
--   Deux inscriptions simultanées de la même équipe pourraient, lues en
--   parallèle, voir chacune 4 et ne rien faire — ou 5 chacune et inscrire deux
--   fois. `pool_register` sérialise donc les inscriptions d'un même tournoi
--   (verrou consultatif de transaction) et fait lecture + écriture d'un bloc.
--
-- CE QUE L'INSCRIPTION AUTOMATIQUE N'ÉMET PAS.
--   Aucun événement bot : l'équipe existe déjà (rôle et salons Discord en
--   place), et une annonce par équipe qui franchit le seuil ferait du bruit sur
--   un événement costumé. Même logique que `solo_mode`.
--
-- ⚠ `max_players` SUR UN TOURNOI « POOL » : À LAISSER VIDE.
--   `enforce_team_max_players` refuse tout ajout de membre à une équipe
--   inscrite à un tournoi dont `max_players` est posé. Inscrire au Halloween
--   une équipe réelle de 8 avec `max_players = 5` bloquerait tout recrutement
--   de cette équipe jusqu'à la fin de l'événement. La taille de 5 est portée
--   par l'appel à `pool_register`, pas par la colonne.
--
-- TENANCY / RLS:
--   Table nouvelle, données personnelles (pseudo, BattleTag, équipe) : RLS
--   activée, accès `service_role` seul — toutes les lectures passent par des
--   routes API qui vérifient l'identité. Fonction réservée au service role.
--
-- SCHEMA CACHE:
--   Nouvelles FK (tournaments, teams) → recharger le cache PostgREST après
--   application : NOTIFY pgrst, 'reload schema'; (fait en fin de fichier).
--
-- Idempotente. Ré-appliquable.

BEGIN;

-- 1) Le drapeau du tournoi.
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS pooled_teams boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tournaments.pooled_teams IS
  'true = inscription individuelle regroupée en équipes de 5 : une équipe réelle est inscrite dès que 5 de ses membres se sont inscrites, les autres joueuses vont en liste d''attente (tournament_pool_entries) que le staff répartit. Parcours public : /tournament/<id>/inscription-solo, connexion requise.';

-- 2) Les inscriptions individuelles.
CREATE TABLE IF NOT EXISTS public.tournament_pool_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  tournament_id   uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  -- auth.users : pas de FK, comme partout ailleurs dans le schéma public.
  user_id         uuid NOT NULL,
  display_name    text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 40),
  battle_tag      text NOT NULL CHECK (char_length(battle_tag) BETWEEN 3 AND 40),
  -- L'équipe réelle de la joueuse, telle que déclarée à l'inscription (et
  -- vérifiée côté API contre team_members). NULL = sans équipe.
  origin_team_id  uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'waitlist'
                  CHECK (status IN ('waitlist', 'placed', 'withdrawn')),
  -- L'équipe dans laquelle elle JOUE cet événement (lot 2 : peut différer de
  -- origin_team_id). NULL tant qu'elle n'est pas placée.
  placed_team_id  uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  placed_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, user_id),
  CHECK ((status = 'placed') = (placed_team_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_tournament_pool_entries_status
  ON public.tournament_pool_entries (tournament_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_tournament_pool_entries_origin
  ON public.tournament_pool_entries (tournament_id, origin_team_id)
  WHERE origin_team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tournament_pool_entries_user
  ON public.tournament_pool_entries (tenant_id, user_id);

ALTER TABLE public.tournament_pool_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tournament_pool_entries_service_role
  ON public.tournament_pool_entries;
CREATE POLICY tournament_pool_entries_service_role
  ON public.tournament_pool_entries FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3) Inscription + seuil d'équipe, d'un bloc.
--
-- Rend : entry_id, status de l'inscription, team_registered (true si CET
-- appel a inscrit l'équipe d'origine au tournoi).
--
-- Réinscription : une ligne `withdrawn` est réactivée en liste d'attente ; une
-- ligne active voit seulement son pseudo / BattleTag / équipe mis à jour (tant
-- qu'elle n'est pas placée — une joueuse placée ne change plus d'équipe
-- d'origine par ce chemin).
CREATE OR REPLACE FUNCTION public.pool_register(
  p_tenant_id uuid,
  p_tournament_id uuid,
  p_user_id uuid,
  p_display_name text,
  p_battle_tag text,
  p_origin_team_id uuid,
  p_team_size integer DEFAULT 5
)
RETURNS TABLE (entry_id uuid, entry_status text, team_registered boolean)
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_entry public.tournament_pool_entries%ROWTYPE;
  v_ready integer;
  v_registered boolean := false;
BEGIN
  -- Une inscription à la fois par tournoi : le seuil se lit et s'écrit sans
  -- qu'une autre inscription ne s'intercale.
  PERFORM pg_advisory_xact_lock(hashtext('pool_register:' || p_tournament_id::text));

  SELECT * INTO v_entry
    FROM public.tournament_pool_entries
   WHERE tournament_id = p_tournament_id AND user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.tournament_pool_entries
      (tenant_id, tournament_id, user_id, display_name, battle_tag, origin_team_id)
    VALUES
      (p_tenant_id, p_tournament_id, p_user_id, p_display_name, p_battle_tag, p_origin_team_id)
    RETURNING * INTO v_entry;
  ELSIF v_entry.status = 'placed' THEN
    UPDATE public.tournament_pool_entries
       SET display_name = p_display_name, battle_tag = p_battle_tag, updated_at = now()
     WHERE id = v_entry.id
    RETURNING * INTO v_entry;
  ELSE
    UPDATE public.tournament_pool_entries
       SET display_name = p_display_name,
           battle_tag = p_battle_tag,
           origin_team_id = p_origin_team_id,
           status = 'waitlist',
           updated_at = now()
     WHERE id = v_entry.id
    RETURNING * INTO v_entry;
  END IF;

  -- Le seuil : 5 membres de la même équipe en attente, équipe pas encore
  -- inscrite à ce tournoi.
  IF v_entry.status = 'waitlist'
     AND v_entry.origin_team_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.tournament_teams
        WHERE tournament_id = p_tournament_id AND team_id = v_entry.origin_team_id
     )
  THEN
    SELECT count(*) INTO v_ready
      FROM public.tournament_pool_entries
     WHERE tournament_id = p_tournament_id
       AND origin_team_id = v_entry.origin_team_id
       AND status = 'waitlist';

    IF v_ready >= p_team_size THEN
      -- Les 5 PREMIÈRES inscrites de l'équipe jouent ; les suivantes restent
      -- en attente (remplaçantes, ou renfort d'une autre équipe au lot 2).
      UPDATE public.tournament_pool_entries e
         SET status = 'placed',
             placed_team_id = e.origin_team_id,
             placed_at = now(),
             updated_at = now()
       WHERE e.id IN (
         SELECT id FROM public.tournament_pool_entries
          WHERE tournament_id = p_tournament_id
            AND origin_team_id = v_entry.origin_team_id
            AND status = 'waitlist'
          ORDER BY created_at, id
          LIMIT p_team_size
       );

      INSERT INTO public.tournament_teams (tenant_id, tournament_id, team_id, status)
      VALUES (p_tenant_id, p_tournament_id, v_entry.origin_team_id, 'registered')
      ON CONFLICT (tournament_id, team_id) DO NOTHING;

      -- Comme le parcours d'inscription classique : l'équipe est rattachée à
      -- toutes les phases du tournoi.
      INSERT INTO public.stage_teams (stage_id, team_id, tenant_id)
      SELECT s.id, v_entry.origin_team_id, p_tenant_id
        FROM public.tournament_stages s
       WHERE s.tournament_id = p_tournament_id
      ON CONFLICT (stage_id, team_id) DO NOTHING;

      v_registered := true;

      SELECT * INTO v_entry FROM public.tournament_pool_entries WHERE id = v_entry.id;
    END IF;
  END IF;

  RETURN QUERY SELECT v_entry.id, v_entry.status, v_registered;
END;
$function$;

REVOKE ALL ON FUNCTION public.pool_register(uuid, uuid, uuid, text, text, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pool_register(uuid, uuid, uuid, text, text, uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.pool_register(uuid, uuid, uuid, text, text, uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pool_register(uuid, uuid, uuid, text, text, uuid, integer) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
