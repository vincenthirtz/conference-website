-- Migration: SELECT policies scope-limitées casters sur event_cues / event_cue_acks / caster_presence
-- Date: 2026-05-25
--
-- WHY:
--   Lot 5 → 7 de la feature Run-of-show ([[feature-run-of-show]]). Le Caster
--   Cockpit PWA passe aujourd'hui par polling REST 3s pour récupérer les cues
--   du Director. Sur un cue 'urgent' (action requise immédiate, ack obligatoire),
--   3 secondes de latence est trop : on veut passer à du push realtime
--   Supabase postgres_changes → latence ~100ms côté caster.
--
--   La migration sœur `create_event_cues_and_presence_tables.sql` (2026-05-21)
--   avait délibérément posé un default-deny strict (RLS enabled, ZÉRO policy)
--   en prévision : "Si la V2 décide de migrer vers realtime client direct, on
--   ajoutera une policy SELECT scope-limitée [...] sur les 3 tables." Cette
--   migration matérialise ce V2 — pile la spec annoncée.
--
-- POURQUOI scope-limité via cast_members.auth_user_id :
--   Un caster authentifié (auth.uid()) ne doit voir QUE les rows de SON tenant.
--   On JOIN sur cast_members(auth_user_id, tenant_id) pour résoudre dynamiquement
--   les tenants auxquels l'utilisateur appartient en tant que caster actif
--   (is_active = true filtre les anciens castings désactivés). Isolation
--   cross-tenant strictement maintenue : un caster du tenant A ne verra jamais
--   les cues du tenant B même si la même auth_user_id a un compte actif sur B
--   (le filtre tenant_id IN (...) ne renvoie que les tenants matchant).
--
-- POURQUOI safe (zéro fuite de données sensibles) :
--   - event_cues : consignes Director adressées aux casters du run. Par
--     définition, les casters connectés DOIVENT les voir — c'est leur seul
--     intérêt. Pas de donnée tierce dedans (le `created_by_user_id` est juste
--     un uuid auteur, pas d'info perso).
--   - event_cue_acks : qui (cast_member_id) a ack quel cue. Déjà visible
--     via l'API admin Director ; les casters d'un même tenant peuvent voir les
--     acks de leurs collègues — non sensible (ils sont dans la même équipe
--     d'event). Permet aussi au cockpit de mettre à jour `acked_by_me` localement
--     sans refetch.
--   - caster_presence : last_seen_at + user_agent + run binding. Idem,
--     visibilité intra-tenant entre casters = cohérence (le cockpit pourrait
--     afficher "3 casters online sur ce run" plus tard sans refactor).
--
-- POSTURE RLS PRÉSERVÉE :
--   - Anon (visiteur public, vitrine site) reste BLOQUÉ : les policies ciblent
--     `TO authenticated` exclusivement. Aucune fuite côté grand public.
--   - service_role (supabaseAdmin) bypass RLS comme toujours → tous les
--     handlers API Director/admin continuent de fonctionner identiquement.
--   - On n'ajoute AUCUN INSERT/UPDATE/DELETE policy : toutes les mutations
--     restent canalisées par supabaseAdmin via les routes API authentifiées
--     (Director crée les cues, caster ack via POST /api/.../ack). Les clients
--     authenticated peuvent UNIQUEMENT lire — la surface d'attaque RLS est
--     donc minimale.
--
-- POURQUOI une subquery inlinée plutôt qu'une fonction SQL helper :
--   Transparence + zéro magie. La subquery `tenant_id IN (SELECT cm.tenant_id
--   FROM cast_members cm WHERE cm.auth_user_id = auth.uid() AND cm.is_active)`
--   est planifiable directement par Postgres avec l'index existant sur
--   `cast_members(auth_user_id)`. Une fonction `SECURITY DEFINER` masquerait
--   la logique d'autorisation à la lecture de pg_policies.
--
-- CAVEATS:
--   - Idempotente : DROP POLICY IF EXISTS avant chaque CREATE POLICY.
--   - PAS de schema cache reload requis : on n'ajoute ni table ni FK, juste
--     des policies. PostgREST n'a pas besoin de recharger.
--   - Réplication realtime déjà activée sur les 3 tables (cf. migration sœur,
--     bloc DO `ALTER PUBLICATION supabase_realtime ADD TABLE ...`). Sans la
--     SELECT policy, les subscriptions postgres_changes recevaient les events
--     WAL mais filtraient TOUT côté Realtime (pas de droit SELECT = pas de
--     payload livré au client). Cette migration débloque la livraison effective.
--   - Index existant `cast_members(auth_user_id)` : vérifier qu'il existe
--     pour garantir que la subquery est efficace sur chaque check de policy.
--     S'il manque, ajouter `CREATE INDEX IF NOT EXISTS idx_cast_members_auth_user
--     ON cast_members (auth_user_id)` dans une migration suivante (out-of-scope ici).

BEGIN;

-- ===========================================================================
-- event_cues : SELECT pour caster authentifié du tenant
-- ===========================================================================
DROP POLICY IF EXISTS event_cues_caster_select ON public.event_cues;
CREATE POLICY event_cues_caster_select
  ON public.event_cues
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT cm.tenant_id
      FROM public.cast_members cm
      WHERE cm.auth_user_id = auth.uid()
        AND cm.is_active = true
    )
  );

COMMENT ON POLICY event_cues_caster_select ON public.event_cues IS
  'Caster authentifié peut SELECT les cues de tous les tenants où il est cast_members.is_active=true. Pour subscriptions realtime postgres_changes côté cockpit.';

-- ===========================================================================
-- event_cue_acks : SELECT pour caster authentifié du tenant
-- ===========================================================================
DROP POLICY IF EXISTS event_cue_acks_caster_select ON public.event_cue_acks;
CREATE POLICY event_cue_acks_caster_select
  ON public.event_cue_acks
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT cm.tenant_id
      FROM public.cast_members cm
      WHERE cm.auth_user_id = auth.uid()
        AND cm.is_active = true
    )
  );

COMMENT ON POLICY event_cue_acks_caster_select ON public.event_cue_acks IS
  'Caster authentifié peut SELECT les acks de son tenant (le sien pour update local + ceux des collègues du même tenant pour cohérence UI). Mutations restent via supabaseAdmin.';

-- ===========================================================================
-- caster_presence : SELECT pour caster authentifié du tenant
-- ===========================================================================
DROP POLICY IF EXISTS caster_presence_caster_select ON public.caster_presence;
CREATE POLICY caster_presence_caster_select
  ON public.caster_presence
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT cm.tenant_id
      FROM public.cast_members cm
      WHERE cm.auth_user_id = auth.uid()
        AND cm.is_active = true
    )
  );

COMMENT ON POLICY caster_presence_caster_select ON public.caster_presence IS
  'Caster authentifié peut SELECT la presence des casters de son tenant. Préparé pour affichage "casters online" cockpit. Heartbeats UPSERT restent via supabaseAdmin.';

COMMIT;
