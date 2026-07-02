-- Migration: add_team_membership_integrity.sql
-- Date: 2026-07-02
--
-- WHY:
--   Le flow d'appartenance aux équipes (join / transfer / invite) est aujourd'hui
--   piloté côté handler HTTP par une séquence NON atomique de requêtes Supabase :
--     1. check-then-insert « le joueur est-il déjà dans une équipe ? » puis INSERT
--        dans team_members  (pages/api/teams/join-requests.ts,
--        utils/teams/invitations.ts) ;
--     2. pour un transfert : DELETE de l'ancienne appartenance PUIS INSERT dans la
--        nouvelle, en deux appels réseau distincts (transfer-requests.ts) ;
--     3. UPDATE demandes.status = 'approved' dans un troisième appel.
--   Aucun verrou ne protège ces étapes. Deux capitaines qui approuvent en même
--   temps deux demandes du même joueur, ou un double-clic, peuvent :
--     - insérer le joueur dans DEUX équipes (course sur le check-then-insert) ;
--     - laisser un transfert à moitié appliqué (DELETE réussi, INSERT échoué → le
--       joueur n'est plus dans AUCUNE équipe) ;
--     - passer status='approved' alors que l'INSERT a échoué (incohérence
--       demande/roster, cf. le commentaire d'aveu dans invitations.ts:349).
--
--   Cette migration ferme ces trous à la source (la base), pas au cas par cas
--   dans chaque handler :
--     1. Une contrainte UNIQUE (tenant_id, user_id) sur team_members : invariant
--        dur « un joueur = une seule équipe par tenant ». Elle transforme la
--        course check-then-insert en une erreur 23505 déterministe côté DB au lieu
--        d'un état corrompu.
--     2. Trois fonctions PL/pgSQL transactionnelles (le corps d'une fonction
--        plpgsql s'exécute dans la transaction de l'appelant → tout réussit ou
--        tout est annulé) qui verrouillent la demande (SELECT ... FOR UPDATE),
--        valident l'état, muent le roster ET la demande atomiquement. Les
--        handlers les appellent via `supabaseAdmin.rpc(...)` et se contentent de
--        traduire les exceptions à message stable en codes HTTP.
--
-- WHAT:
--   1. ALTER TABLE public.team_members ADD CONSTRAINT team_members_tenant_user_key
--      UNIQUE (tenant_id, user_id)  — via DO block idempotent (Postgres n'a pas
--      ADD CONSTRAINT IF NOT EXISTS).
--   2. public.approve_join_request(uuid)      RETURNS jsonb
--      public.approve_transfer_request(uuid)  RETURNS jsonb
--      public.accept_invitation(uuid, uuid)   RETURNS jsonb
--      Toutes SECURITY DEFINER, SET search_path = public, pg_temp,
--      EXECUTE réservé à service_role.
--
-- CAVEATS:
--   - Idempotente : DO block gardé par pg_constraint pour la contrainte ;
--     CREATE OR REPLACE FUNCTION pour les fonctions ; GRANT rejouable.
--   - Pas de reload du schema cache PostgREST nécessaire : aucune FOREIGN KEY
--     n'est ajoutée/modifiée (une UNIQUE constraint n'affecte pas les embeds
--     PostgREST, et les fonctions RPC sont exposées automatiquement).
--   - Prérequis vérifiés en base au moment de l'écriture :
--       * team_members possède déjà UNIQUE (team_id, user_id) et le trigger
--         team_members_enforce_max_players (capacité race-safe) ;
--       * 0 joueur actuellement dans >1 équipe → la nouvelle UNIQUE passe sans
--         nettoyage préalable.
--   - Exemption coach : la contrainte UNIQUE (tenant_id, user_id) interdit AUSSI
--     à un coach d'être coach de plusieurs équipes. Ce n'est PAS souhaité à
--     terme, mais ce n'est pas la règle aujourd'hui (0 doublon en base). Évolution
--     possible : remplacer par un index partiel
--       CREATE UNIQUE INDEX ... ON team_members (tenant_id, user_id)
--         WHERE role <> 'coach';
--     ce qui autoriserait un coach multi-équipes tout en gardant l'unicité pour
--     les joueuses. À décider avec le métier ; non appliqué ici.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Contrainte : un joueur = une seule équipe par tenant.
--    Bloque le multi-équipe issu des courses check-then-insert des handlers.
--    DO block car Postgres n'accepte pas ADD CONSTRAINT IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'team_members_tenant_user_key'
      AND conrelid = 'public.team_members'::regclass
  ) THEN
    ALTER TABLE public.team_members
      ADD CONSTRAINT team_members_tenant_user_key UNIQUE (tenant_id, user_id);
  END IF;
END
$$;

COMMENT ON CONSTRAINT team_members_tenant_user_key ON public.team_members IS
  'Un joueur (user_id) ne peut appartenir qu''à une seule équipe par tenant. '
  'Ferme la race check-then-insert des handlers approve/transfer/accept : la '
  'violation remonte en 23505 (unique_violation) que les fonctions RPC laissent '
  'filtrer vers le handler. NB : inclut les coachs pour l''instant (voir CAVEATS '
  'de la migration pour l''évolution index partiel).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2a. approve_join_request(p_demande_id)
--     Le capitaine approuve une demande de type 'join'.
--     demandes.team_id  = équipe cible
--     payload.desired_role     = rôle souhaité (validé, privilégiés exclus)
--     payload.user_battle_tag  = BattleTag (optionnel)
--
--     Atomicité : FOR UPDATE sur la demande + INSERT team_members + UPDATE status
--     dans la même transaction (corps plpgsql). unique_violation (23505, déjà
--     dans une équipe) et check_violation (trigger max_players) remontent tels
--     quels à l'appelant.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_join_request(p_demande_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_demande  public.demandes%ROWTYPE;
  v_role     text;
  v_is_sub   boolean;
  v_member   public.team_members%ROWTYPE;
BEGIN
  -- Verrouille la demande pour sérialiser les approbations concurrentes.
  SELECT * INTO v_demande
  FROM public.demandes
  WHERE id = p_demande_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'demande_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_demande.type <> 'join' THEN
    RAISE EXCEPTION 'demande_wrong_type' USING ERRCODE = 'raise_exception';
  END IF;

  IF v_demande.status <> 'pending' THEN
    RAISE EXCEPTION 'demande_not_pending' USING ERRCODE = 'raise_exception';
  END IF;

  IF v_demande.team_id IS NULL THEN
    RAISE EXCEPTION 'demande_no_team' USING ERRCODE = 'raise_exception';
  END IF;

  -- Rôle : on refuse les rôles privilégiés (manager) par cette voie ;
  -- substitute reste valide, tout le reste retombe sur 'player'.
  v_role := lower(coalesce(v_demande.payload->>'desired_role', 'player'));
  IF v_role NOT IN ('player', 'substitute', 'coach') THEN
    v_role := 'player';
  END IF;
  v_is_sub := (v_role = 'substitute');

  -- Insert du membre. Laisse remonter :
  --   23505 unique_violation  -> déjà dans une équipe (tenant_user_key)
  --                              ou déjà dans CETTE équipe (team_id/user_id key)
  --   check_violation         -> trigger max_players
  INSERT INTO public.team_members (tenant_id, team_id, user_id, role, battle_tag, is_substitute)
  VALUES (
    v_demande.tenant_id,
    v_demande.team_id,
    v_demande.user_id,
    v_role,
    nullif(v_demande.payload->>'user_battle_tag', ''),
    v_is_sub
  )
  RETURNING * INTO v_member;

  UPDATE public.demandes
  SET status = 'approved', processed_at = now()
  WHERE id = p_demande_id;

  RETURN to_jsonb(v_member);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2b. approve_transfer_request(p_demande_id)
--     Le capitaine de l'équipe cible approuve un transfert.
--     demandes.team_id = équipe CIBLE
--     payload.desired_role / payload.user_battle_tag / payload.from_team_id
--
--     IMPORTANT : on résout l'appartenance RÉELLE du joueur en base
--     (SELECT ... FROM team_members WHERE tenant_id + user_id), on n'utilise PAS
--     payload.from_team_id (qui peut être périmé si le joueur a bougé depuis la
--     création de la demande). DELETE de l'appartenance réelle PUIS INSERT dans
--     l'équipe cible, atomique.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_transfer_request(p_demande_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_demande       public.demandes%ROWTYPE;
  v_role          text;
  v_is_sub        boolean;
  v_battle_tag    text;
  v_current_team  uuid;
  v_member        public.team_members%ROWTYPE;
BEGIN
  SELECT * INTO v_demande
  FROM public.demandes
  WHERE id = p_demande_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'demande_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_demande.type <> 'transfer' THEN
    RAISE EXCEPTION 'demande_wrong_type' USING ERRCODE = 'raise_exception';
  END IF;

  IF v_demande.status <> 'pending' THEN
    RAISE EXCEPTION 'demande_not_pending' USING ERRCODE = 'raise_exception';
  END IF;

  IF v_demande.team_id IS NULL THEN
    RAISE EXCEPTION 'demande_no_team' USING ERRCODE = 'raise_exception';
  END IF;

  v_role := lower(coalesce(v_demande.payload->>'desired_role', 'player'));
  IF v_role NOT IN ('player', 'substitute', 'coach') THEN
    v_role := 'player';
  END IF;
  v_is_sub := (v_role = 'substitute');

  -- Appartenance RÉELLE du joueur (source de vérité, pas le payload).
  -- Verrouille la ligne pour éviter qu'un autre transfert la déplace en parallèle.
  SELECT team_id, battle_tag INTO v_current_team, v_battle_tag
  FROM public.team_members
  WHERE tenant_id = v_demande.tenant_id
    AND user_id = v_demande.user_id
  FOR UPDATE;

  -- Cas « déjà dans l'équipe cible » : rien à faire côté roster, on clôt la
  -- demande proprement et on renvoie le membre existant.
  IF v_current_team = v_demande.team_id THEN
    UPDATE public.demandes
    SET status = 'approved', processed_at = now()
    WHERE id = p_demande_id;

    SELECT * INTO v_member
    FROM public.team_members
    WHERE tenant_id = v_demande.tenant_id
      AND user_id = v_demande.user_id;

    RETURN to_jsonb(v_member);
  END IF;

  -- BattleTag : payload en priorité, sinon on reprend celui de l'appartenance
  -- actuelle (parité avec transfer-requests.ts).
  v_battle_tag := coalesce(
    nullif(v_demande.payload->>'user_battle_tag', ''),
    v_battle_tag
  );

  -- Retire l'appartenance réelle (si le joueur en a une), PUIS insère dans la
  -- cible. Atomique : si l'INSERT échoue (max_players, etc.), le DELETE est
  -- annulé avec la transaction — le joueur ne se retrouve jamais sans équipe.
  IF v_current_team IS NOT NULL THEN
    DELETE FROM public.team_members
    WHERE tenant_id = v_demande.tenant_id
      AND user_id = v_demande.user_id;
  END IF;

  INSERT INTO public.team_members (tenant_id, team_id, user_id, role, battle_tag, is_substitute)
  VALUES (
    v_demande.tenant_id,
    v_demande.team_id,
    v_demande.user_id,
    v_role,
    v_battle_tag,
    v_is_sub
  )
  RETURNING * INTO v_member;

  UPDATE public.demandes
  SET status = 'approved', processed_at = now()
  WHERE id = p_demande_id;

  RETURN to_jsonb(v_member);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2c. accept_invitation(p_demande_id, p_user_id)
--     La joueuse invitée accepte une invitation (type 'invite').
--     demandes.user_id = invitee ; demandes.team_id = équipe.
--     payload.desired_role / payload.battle_tag (clé DIFFÉRENTE de join/transfer :
--     'battle_tag', pas 'user_battle_tag' — cf. utils/teams/invitations.ts).
--
--     p_user_id = acteur authentifié ; on vérifie qu'il est bien l'invité.
--     N' APPLIQUE PAS l'expiration ici (payload.expires_at) : le handler /
--     helper acceptInvitation gère déjà expiry + roster lock avant l'appel RPC.
--     Cette fonction couvre l'atomicité insert-membre + passage à 'approved'.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_invitation(p_demande_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_demande  public.demandes%ROWTYPE;
  v_role     text;
  v_is_sub   boolean;
  v_member   public.team_members%ROWTYPE;
BEGIN
  SELECT * INTO v_demande
  FROM public.demandes
  WHERE id = p_demande_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'demande_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_demande.type <> 'invite' THEN
    RAISE EXCEPTION 'demande_wrong_type' USING ERRCODE = 'raise_exception';
  END IF;

  IF v_demande.status <> 'pending' THEN
    RAISE EXCEPTION 'demande_not_pending' USING ERRCODE = 'raise_exception';
  END IF;

  -- Seule l'invitée peut accepter sa propre invitation.
  IF v_demande.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'not_owner' USING ERRCODE = 'raise_exception';
  END IF;

  IF v_demande.team_id IS NULL THEN
    RAISE EXCEPTION 'demande_no_team' USING ERRCODE = 'raise_exception';
  END IF;

  v_role := lower(coalesce(v_demande.payload->>'desired_role', 'player'));
  IF v_role NOT IN ('player', 'substitute', 'coach') THEN
    v_role := 'player';
  END IF;
  v_is_sub := (v_role = 'substitute');

  INSERT INTO public.team_members (tenant_id, team_id, user_id, role, battle_tag, is_substitute)
  VALUES (
    v_demande.tenant_id,
    v_demande.team_id,
    v_demande.user_id,
    v_role,
    nullif(v_demande.payload->>'battle_tag', ''),
    v_is_sub
  )
  RETURNING * INTO v_member;

  UPDATE public.demandes
  SET status = 'approved', processed_at = now()
  WHERE id = p_demande_id;

  RETURN to_jsonb(v_member);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants : seul service_role (supabaseAdmin, appelant serveur) exécute ces
-- fonctions. On révoque explicitement le public pour ne pas exposer via
-- PostgREST aux clients anon/authenticated.
-- ─────────────────────────────────────────────────────────────────────────────
-- NB : sous Supabase, anon/authenticated reçoivent EXECUTE via des default
-- privileges SÉPARÉS de PUBLIC. Révoquer PUBLIC seul ne suffit PAS (ces fonctions
-- SECURITY DEFINER mutent le roster) — on révoque explicitement les trois.
REVOKE ALL ON FUNCTION public.approve_join_request(uuid)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_transfer_request(uuid)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_invitation(uuid, uuid)       FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.approve_join_request(uuid)       TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_transfer_request(uuid)   TO service_role;
GRANT EXECUTE ON FUNCTION public.accept_invitation(uuid, uuid)    TO service_role;

COMMENT ON FUNCTION public.approve_join_request(uuid) IS
  'Approuve atomiquement une demande join : verrou FOR UPDATE, INSERT team_members, '
  'status=approved. Exceptions à message stable : demande_not_found, demande_wrong_type, '
  'demande_not_pending, demande_no_team ; laisse filtrer unique_violation (23505) et '
  'check_violation (max_players). Appel : rpc(approve_join_request, {p_demande_id}).';

COMMENT ON FUNCTION public.approve_transfer_request(uuid) IS
  'Approuve atomiquement un transfert : résout l''appartenance RÉELLE du joueur '
  '(pas payload.from_team_id), DELETE + INSERT dans l''équipe cible, status=approved. '
  'Gère le cas déjà-dans-la-cible. Mêmes exceptions stables que approve_join_request.';

COMMENT ON FUNCTION public.accept_invitation(uuid, uuid) IS
  'Accepte atomiquement une invitation : vérifie que p_user_id est bien l''invité '
  '(sinon not_owner), INSERT team_members, status=approved. N''applique pas l''expiry '
  '(géré côté helper avant l''appel). Appel : rpc(accept_invitation, {p_demande_id, p_user_id}).';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- RECOMMANDATIONS (non appliquées ici — une seule préoccupation par migration) :
--
--   1. FK demandes.team_id → teams(id) est déjà posée (demandes_team_id_fkey,
--      ON DELETE SET NULL) : les fonctions gèrent team_id NULL (demande_no_team).
--      RAS.
--
--   2. Envisager une CHECK sur demandes garantissant que les demandes de type
--      join/transfer/invite ont TOUJOURS un team_id NOT NULL (aujourd'hui c'est
--      seulement conventionnel). Impact : auditer les lignes historiques avant
--      d'ajouter la contrainte (une demande annulée avec team_id passé à NULL par
--      le ON DELETE SET NULL violerait le CHECK). À traiter dans une migration
--      dédiée si le métier le veut.
--
--   3. Si l'exemption coach multi-équipes devient un besoin (voir CAVEATS),
--      remplacer team_members_tenant_user_key par un index partiel WHERE
--      role <> 'coach', dans une migration séparée avec backfill/audit.
-- ─────────────────────────────────────────────────────────────────────────────
