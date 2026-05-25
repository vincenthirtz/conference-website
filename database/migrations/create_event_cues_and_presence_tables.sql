-- Migration: création des tables `event_cues`, `event_cue_acks`, `caster_presence`
-- Date: 2026-05-21
--
-- WHY:
--   Troisième brique de la feature "Run-of-show" (Caster Cockpit PWA + Live
--   Director). On ajoute trois tables liées à la communication temps réel
--   entre le Director (staff) et les casters connectés au cockpit :
--
--     1. event_cues : messages courts (broadcast only en V1) émis par le
--        Director vers TOUS les casters connectés au run. Sévérité 3-niveaux
--        info | warn | urgent. Sur urgent uniquement, l'ack du caster est
--        requis et tracé pour que le Director sache qui a vu.
--
--     2. event_cue_acks : trace les ack des cues urgents par cast_member.
--        Append-only ; on stocke (cue_id, cast_member_id) PK pour idempotence
--        — un caster ne ack qu'une fois le même cue. tenant_id dénormalisé
--        (cf. justification event_segments) pour filtre realtime direct.
--
--     3. caster_presence : 1 row par cast_member (PK = cast_member_id). Le
--        cockpit fait un heartbeat POST toutes les 20s qui UPSERT
--        last_seen_at. Le statut online/idle/offline est DÉRIVÉ à la lecture
--        (online < 60s, idle 60–180s, offline > 180s) — pas stocké, pas de
--        cron requis. Permet au Director de voir l'état des casters en live.
--
-- DÉCISIONS PRODUIT VERROUILLÉES (cf. memory feature-run-of-show 2026-05-21) :
--   - Cues = broadcast only (pas de ciblage par caster ni par segment en V1).
--   - Sévérité 3-niveaux. Ack obligatoire pour 'urgent' uniquement.
--   - Heartbeat 20s côté cockpit, statut dérivé à la lecture.
--
-- DÉNORMALISATION tenant_id (event_cue_acks + caster_presence) :
--   Strictement déductible via event_cues.tenant_id ou cast_members.tenant_id
--   mais on duplique pour :
--     1. Filtre realtime direct sans JOIN (channels Supabase = filter SQL
--        sur une colonne de la table émettrice).
--     2. Queries admin "toute l'activité du tenant X" sans JOIN systématique.
--   Invariant maintenu côté API : handlers admin set tenant_id explicitement
--   à l'insert/upsert. Pas de trigger DB en V1 (cf. event_segments).
--
-- RLS DECISION — default deny strict (aligné sur event_segments) :
--   ALTER TABLE ... ENABLE ROW LEVEL SECURITY SANS AUCUNE POLICY pour les
--   trois tables. Justification :
--     - Le cockpit caster consomme cues + presence via une route API
--       authentifiée (auth check caster) qui lit via supabaseAdmin.
--     - Les hooks realtime côté client (useRealtimeChannel) utilisent l'anon
--       key et ne recevront pas de payloads (pas de SELECT policy anon) — ce
--       qui est ALIGNÉ sur le pattern event_segments : le cockpit refetch
--       via REST en filet de sécurité (+ subscription locale pour réveils
--       d'événements), pas en source de vérité directe.
--     - Les cues peuvent contenir des consignes Director internes (ex.
--       "annonce le sponsor X, pas Y"), pas exposables au public anon.
--     - caster_presence contient user_agent + heartbeats : ops-internal,
--       pas public.
--   Si la V2 décide de migrer vers realtime client direct, on ajoutera une
--   policy SELECT scope-limitée (`tenant_id IN (SELECT tenant_id FROM
--   cast_members WHERE auth_user_id = auth.uid())`) sur les 3 tables. Pour
--   l'instant, on garde le default deny et la route API.
--
-- REALTIME PUBLICATION :
--   Les 3 tables sont ajoutées à `supabase_realtime` pour permettre aux
--   subscriptions côté serveur (si on en active via service_role plus tard)
--   et au pattern existant de fonctionner. Bloc DO idempotent — la
--   publication peut déjà contenir la table sans crasher.
--
-- CAVEATS:
--   - Idempotente : IF NOT EXISTS partout, DO $$ pour la publication.
--   - PostgREST schema cache reload requis (3 nouvelles tables + FKs).
--   - created_by_user_id sans FK auth.users(id) pour éviter le couplage au
--     schéma `auth` (cf. pattern existant). La validation existence est
--     déférée au handler API qui a déjà l'auth context.
--   - expires_at nullable : cron de purge optionnel (cues > 24h) à ajouter
--     plus tard si volumétrie le justifie. V1 = on garde l'historique.
--   - caster_presence : 1 row par caster (PK cast_member_id). UPSERT au
--     heartbeat = pas d'historique de présence — c'est volontaire (l'historique
--     se déduit de event_cue_acks + audit logs). Si besoin d'historique fin,
--     ajouter une table caster_presence_history en V2.
--   - Doit être appliquée APRÈS create_event_runs_table.sql ET
--     create_event_segments_table.sql (FK vers event_runs, et alignement
--     sur cast_members qui existe déjà).

BEGIN;

-- ===========================================================================
-- 1) Table `event_cues`
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.event_cues (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id           uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,

  event_run_id        uuid NOT NULL
    REFERENCES public.event_runs(id) ON DELETE CASCADE,

  severity            text NOT NULL
    CHECK (severity IN ('info', 'warn', 'urgent')),

  body                text NOT NULL
    CHECK (char_length(body) BETWEEN 1 AND 500),

  -- Pas de FK vers auth.users(id) : on évite le couplage au schéma `auth`
  -- (cf. CAVEATS). Le handler API valide l'existence avec son contexte auth.
  created_by_user_id  uuid,

  created_at          timestamptz NOT NULL DEFAULT now(),

  -- Optionnel : permet à un cron futur de purger les cues expirés.
  -- NULL = pas d'expiration (garde dans l'historique).
  expires_at          timestamptz
);

COMMENT ON TABLE public.event_cues IS
  'Cues (messages courts broadcast) émis par le Director vers tous les casters d''un event_run. Append-only. Tenant-scoped.';
COMMENT ON COLUMN public.event_cues.tenant_id IS
  'Tenant propriétaire. FK vers tenants(id) ON DELETE RESTRICT.';
COMMENT ON COLUMN public.event_cues.event_run_id IS
  'Run cible du cue. FK ON DELETE CASCADE (purge du run = purge des cues).';
COMMENT ON COLUMN public.event_cues.severity IS
  'Sévérité : info (FYI) | warn (attention) | urgent (action requise, ack obligatoire).';
COMMENT ON COLUMN public.event_cues.body IS
  'Corps du message, 1–500 caractères. Affiché tel quel dans le cockpit caster.';
COMMENT ON COLUMN public.event_cues.created_by_user_id IS
  'Auteur du cue (Director). Pas de FK auth.users pour éviter le couplage au schéma auth.';
COMMENT ON COLUMN public.event_cues.expires_at IS
  'Expiration optionnelle (cron de purge V2). NULL = pas d''expiration.';

-- Hot path 1 : feed cockpit caster = "tous les cues du run, récents d'abord".
CREATE INDEX IF NOT EXISTS idx_event_cues_tenant_run_created
  ON public.event_cues (tenant_id, event_run_id, created_at DESC);

-- Hot path 2 : Director regarde les urgents non-ack en priorité.
-- Partial index pour ne pas indexer les info/warn (volumétrie majoritaire).
CREATE INDEX IF NOT EXISTS idx_event_cues_urgent
  ON public.event_cues (event_run_id, severity)
  WHERE severity = 'urgent';

-- ===========================================================================
-- 2) Table `event_cue_acks`
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.event_cue_acks (
  cue_id          uuid NOT NULL
    REFERENCES public.event_cues(id) ON DELETE CASCADE,

  cast_member_id  uuid NOT NULL
    REFERENCES public.cast_members(id) ON DELETE CASCADE,

  -- Dénormalisé (cf. WHY ci-dessus). Maintenu cohérent par l'API.
  tenant_id       uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,

  acked_at        timestamptz NOT NULL DEFAULT now(),

  -- Un caster ne ack qu'une fois le même cue (idempotence INSERT côté API).
  PRIMARY KEY (cue_id, cast_member_id)
);

COMMENT ON TABLE public.event_cue_acks IS
  'Ack d''un cue urgent par un cast_member. Append-only. PK composite = idempotence INSERT.';
COMMENT ON COLUMN public.event_cue_acks.cue_id IS
  'Cue acké. FK ON DELETE CASCADE.';
COMMENT ON COLUMN public.event_cue_acks.cast_member_id IS
  'Caster qui ack. FK ON DELETE CASCADE.';
COMMENT ON COLUMN public.event_cue_acks.tenant_id IS
  'Dénormalisé depuis event_cues.tenant_id (filtre realtime + queries admin).';

-- Hot path : Director "qui a ack ce cue ?" — déjà couvert par la PK
-- (cue_id, cast_member_id) côté lookup par cue_id. Index séparé sur
-- (tenant_id, cue_id) pour les queries cross-cue scoped tenant.
CREATE INDEX IF NOT EXISTS idx_event_cue_acks_tenant_cue
  ON public.event_cue_acks (tenant_id, cue_id);

-- FK index sur cast_member_id (advisor performance "unindexed_foreign_keys").
CREATE INDEX IF NOT EXISTS idx_event_cue_acks_cast_member
  ON public.event_cue_acks (cast_member_id);

-- ===========================================================================
-- 3) Table `caster_presence`
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.caster_presence (
  -- 1 row par caster : UPSERT au heartbeat.
  cast_member_id  uuid PRIMARY KEY
    REFERENCES public.cast_members(id) ON DELETE CASCADE,

  tenant_id       uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,

  -- Set quand le cockpit est connecté à un run live, NULL sinon.
  -- ON DELETE SET NULL : si le run est supprimé, le caster reste mais
  -- perd son binding (il pourra se reconnecter à un autre run).
  event_run_id    uuid
    REFERENCES public.event_runs(id) ON DELETE SET NULL,

  last_seen_at    timestamptz NOT NULL DEFAULT now(),

  -- Debug : utile pour repérer une PWA bloquée sur un device particulier.
  user_agent      text,

  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.caster_presence IS
  'Présence des casters cockpit. 1 row par cast_member (UPSERT heartbeat 20s). Statut online/idle/offline DÉRIVÉ à la lecture (< 60s / 60–180s / > 180s).';
COMMENT ON COLUMN public.caster_presence.cast_member_id IS
  'Caster (PK). FK ON DELETE CASCADE.';
COMMENT ON COLUMN public.caster_presence.tenant_id IS
  'Tenant du caster. FK ON DELETE RESTRICT.';
COMMENT ON COLUMN public.caster_presence.event_run_id IS
  'Run auquel le cockpit est connecté (NULL si pas connecté). FK ON DELETE SET NULL.';
COMMENT ON COLUMN public.caster_presence.last_seen_at IS
  'Dernier heartbeat reçu. Sert au calcul dérivé du statut.';
COMMENT ON COLUMN public.caster_presence.user_agent IS
  'User-Agent du device cockpit (debug). Optionnel.';

-- Hot path Director : "qui est online sur ce run, plus récent d'abord".
CREATE INDEX IF NOT EXISTS idx_caster_presence_tenant_run_seen
  ON public.caster_presence (tenant_id, event_run_id, last_seen_at DESC);

-- ===========================================================================
-- 4) Trigger updated_at sur caster_presence
-- ===========================================================================
--
-- event_cues + event_cue_acks sont append-only — pas de trigger updated_at.
-- caster_presence est UPSERT — trigger nécessaire pour refléter chaque ping.

CREATE OR REPLACE FUNCTION public.caster_presence_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_caster_presence_updated_at ON public.caster_presence;
CREATE TRIGGER trg_caster_presence_updated_at
  BEFORE UPDATE ON public.caster_presence
  FOR EACH ROW
  EXECUTE FUNCTION public.caster_presence_set_updated_at();

-- ===========================================================================
-- 5) RLS — default deny strict (3 tables)
-- ===========================================================================
--
-- Activation RLS sans AUCUNE policy. Justification : cf. RLS DECISION en
-- haut. Toutes les opérations passent par supabaseAdmin via les routes API
-- authentifiées (Director ET cockpit caster). Si V2 décide de migrer le
-- cockpit vers du realtime client direct, ajouter une policy SELECT
-- scope-limitée par cast_members.auth_user_id sur les 3 tables.

ALTER TABLE public.event_cues       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_cue_acks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caster_presence  ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- 6) Realtime publication
-- ===========================================================================
--
-- Ajoute les 3 tables à supabase_realtime. Bloc DO idempotent : si la table
-- est déjà membre de la publication (re-run), on swallow l'erreur.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.event_cues;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL; -- publication absente : env de dev sans realtime
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.event_cue_acks;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.caster_presence;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

COMMIT;

-- ===========================================================================
-- 7) PostgREST schema cache reload
-- ===========================================================================
--
-- 3 nouvelles tables + 5 nouvelles FK vers tenants/event_runs/cast_members/
-- event_cues. PostgREST doit recharger son cache pour exposer les tables et
-- les embeds éventuels (`?select=*,event_cue_acks(*)`).
--
-- Si l'API renvoie "could not find relationship" après l'apply, cliquer
-- aussi "Reload schema cache" dans Dashboard Supabase → Settings → API.

NOTIFY pgrst, 'reload schema';
