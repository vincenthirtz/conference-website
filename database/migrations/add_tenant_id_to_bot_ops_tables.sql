-- Phase 1c — multi-tenant : ajout de tenant_id sur 8 tables bot/ops
--
-- POURQUOI :
--   Suite directe des phases 1a (tables coeur) et 1b (tables joueurs/scrims/news).
--   On scope ici les tables d'orchestration bot et d'audit ops :
--     - demandes              (workflow inscriptions / changements d'équipe)
--     - bot_event_outbox      (queue de delivery site -> discord-bot)
--     - bot_player_actions    (audit des actions /commandes joueurs)
--     - staff_logs            (audit RBAC staff — 79 rows historiques)
--     - bot_locks             (lock distribué role-sync)
--     - bot_idempotency       (cache 5 min réponses bot)
--     - admin_idempotency     (cache 5 min réponses admin)
--     - player_action_snoozes (snooze /mes-actions par joueur)
--
-- PATTERN (identique à 1a/1b) :
--   1. ADD COLUMN tenant_id uuid (nullable, sans default)
--   2. CREATE INDEX idx_<t>_tenant_id
--   3. Backfill UPDATE ... SET tenant_id = '<conference>' WHERE tenant_id IS NULL
--      - demandes : JOIN-backfill via team_id / tournament_id avec fallback hard
--      - autres   : hard-backfill direct sur le tenant conference
--   4. Assertion DO $$ ... RAISE EXCEPTION ... pour vérifier 0 NULL
--   5. NOTIFY pgrst, 'reload schema'
--
-- DIFFÉRÉ EN PHASE 1d :
--   - SET NOT NULL + FK vers tenants(id) sur tenant_id
--   - bot_locks            : PK (name) -> PK (tenant_id, name)
--   - bot_idempotency      : UNIQUE(cache_key) -> UNIQUE(tenant_id, cache_key)
--   - admin_idempotency    : UNIQUE(cache_key) -> UNIQUE(tenant_id, cache_key)
--   - player_action_snoozes: PK (discord_user_id, action_key) -> PK (tenant_id, discord_user_id, action_key)
--   - tournaments / teams / scrims / news / discord_webhooks : composer UNIQUE(slug|channel_type) avec tenant_id
--
-- CAVEAT :
--   - Aucune modification de PK / UNIQUE / FK dans cette migration -> rétrocompatible total.
--   - Idempotent : IF NOT EXISTS partout.
--   - Tenant UUID conference : ce69a726-773e-4d12-b5eb-d2503aa752b4.
--   - Doit être appliquée APRÈS add_tenant_id_to_*_tables des phases 1a et 1b.
--   - PostgREST schema cache reload effectué en fin de fichier.

BEGIN;

-- ============================================================
-- demandes
-- ============================================================
ALTER TABLE public.demandes ADD COLUMN IF NOT EXISTS tenant_id uuid;
CREATE INDEX IF NOT EXISTS idx_demandes_tenant_id ON public.demandes(tenant_id);

-- JOIN-backfill via team_id puis tournament_id (no-op aujourd'hui : 0 rows,
-- mais documente l'intention pour future migration de données multi-tenant).
UPDATE public.demandes d
SET tenant_id = t.tenant_id
FROM public.teams t
WHERE d.tenant_id IS NULL
  AND d.team_id = t.id
  AND t.tenant_id IS NOT NULL;

UPDATE public.demandes d
SET tenant_id = tn.tenant_id
FROM public.tournaments tn
WHERE d.tenant_id IS NULL
  AND d.tournament_id = tn.id
  AND tn.tenant_id IS NOT NULL;

-- Fallback hard sur conference pour rows orphelines (sans team/tournament).
UPDATE public.demandes
SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'
WHERE tenant_id IS NULL;

-- ============================================================
-- bot_event_outbox  (3 rows historiques)
-- Pas de FK exploitable (event_id text, payload jsonb opaque).
-- ============================================================
ALTER TABLE public.bot_event_outbox ADD COLUMN IF NOT EXISTS tenant_id uuid;
CREATE INDEX IF NOT EXISTS idx_bot_event_outbox_tenant_id ON public.bot_event_outbox(tenant_id);
UPDATE public.bot_event_outbox
SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'
WHERE tenant_id IS NULL;

-- ============================================================
-- bot_player_actions  (0 rows)
-- ============================================================
ALTER TABLE public.bot_player_actions ADD COLUMN IF NOT EXISTS tenant_id uuid;
CREATE INDEX IF NOT EXISTS idx_bot_player_actions_tenant_id ON public.bot_player_actions(tenant_id);
UPDATE public.bot_player_actions
SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'
WHERE tenant_id IS NULL;

-- ============================================================
-- staff_logs  (79 rows historiques, table mono-tenant aujourd'hui)
-- Hard-backfill : on est certain que toutes ces rows appartiennent à conference.
-- ============================================================
ALTER TABLE public.staff_logs ADD COLUMN IF NOT EXISTS tenant_id uuid;
CREATE INDEX IF NOT EXISTS idx_staff_logs_tenant_id ON public.staff_logs(tenant_id);
UPDATE public.staff_logs
SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'
WHERE tenant_id IS NULL;

-- ============================================================
-- bot_locks  (0 rows ; PK (name) inchangée en 1c, transition en 1d)
-- ============================================================
ALTER TABLE public.bot_locks ADD COLUMN IF NOT EXISTS tenant_id uuid;
CREATE INDEX IF NOT EXISTS idx_bot_locks_tenant_id ON public.bot_locks(tenant_id);
UPDATE public.bot_locks
SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'
WHERE tenant_id IS NULL;

-- ============================================================
-- bot_idempotency  (0 rows ; UNIQUE(cache_key) inchangé en 1c)
-- ============================================================
ALTER TABLE public.bot_idempotency ADD COLUMN IF NOT EXISTS tenant_id uuid;
CREATE INDEX IF NOT EXISTS idx_bot_idempotency_tenant_id ON public.bot_idempotency(tenant_id);
UPDATE public.bot_idempotency
SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'
WHERE tenant_id IS NULL;

-- ============================================================
-- admin_idempotency  (0 rows ; UNIQUE(cache_key) inchangé en 1c)
-- ============================================================
ALTER TABLE public.admin_idempotency ADD COLUMN IF NOT EXISTS tenant_id uuid;
CREATE INDEX IF NOT EXISTS idx_admin_idempotency_tenant_id ON public.admin_idempotency(tenant_id);
UPDATE public.admin_idempotency
SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'
WHERE tenant_id IS NULL;

-- ============================================================
-- player_action_snoozes  (0 rows ; PK (discord_user_id, action_key) inchangée en 1c)
-- ============================================================
ALTER TABLE public.player_action_snoozes ADD COLUMN IF NOT EXISTS tenant_id uuid;
CREATE INDEX IF NOT EXISTS idx_player_action_snoozes_tenant_id ON public.player_action_snoozes(tenant_id);
UPDATE public.player_action_snoozes
SET tenant_id = 'ce69a726-773e-4d12-b5eb-d2503aa752b4'
WHERE tenant_id IS NULL;

-- ============================================================
-- Assertion : 0 NULL sur les 8 tables.
-- ============================================================
DO $$
DECLARE
  v_demandes              bigint;
  v_bot_event_outbox      bigint;
  v_bot_player_actions    bigint;
  v_staff_logs            bigint;
  v_bot_locks             bigint;
  v_bot_idempotency       bigint;
  v_admin_idempotency     bigint;
  v_player_action_snoozes bigint;
BEGIN
  SELECT count(*) INTO v_demandes              FROM public.demandes              WHERE tenant_id IS NULL;
  SELECT count(*) INTO v_bot_event_outbox      FROM public.bot_event_outbox      WHERE tenant_id IS NULL;
  SELECT count(*) INTO v_bot_player_actions    FROM public.bot_player_actions    WHERE tenant_id IS NULL;
  SELECT count(*) INTO v_staff_logs            FROM public.staff_logs            WHERE tenant_id IS NULL;
  SELECT count(*) INTO v_bot_locks             FROM public.bot_locks             WHERE tenant_id IS NULL;
  SELECT count(*) INTO v_bot_idempotency       FROM public.bot_idempotency       WHERE tenant_id IS NULL;
  SELECT count(*) INTO v_admin_idempotency     FROM public.admin_idempotency     WHERE tenant_id IS NULL;
  SELECT count(*) INTO v_player_action_snoozes FROM public.player_action_snoozes WHERE tenant_id IS NULL;

  IF v_demandes              > 0 THEN RAISE EXCEPTION 'demandes has % NULL tenant_id rows',              v_demandes;              END IF;
  IF v_bot_event_outbox      > 0 THEN RAISE EXCEPTION 'bot_event_outbox has % NULL tenant_id rows',      v_bot_event_outbox;      END IF;
  IF v_bot_player_actions    > 0 THEN RAISE EXCEPTION 'bot_player_actions has % NULL tenant_id rows',    v_bot_player_actions;    END IF;
  IF v_staff_logs            > 0 THEN RAISE EXCEPTION 'staff_logs has % NULL tenant_id rows',            v_staff_logs;            END IF;
  IF v_bot_locks             > 0 THEN RAISE EXCEPTION 'bot_locks has % NULL tenant_id rows',             v_bot_locks;             END IF;
  IF v_bot_idempotency       > 0 THEN RAISE EXCEPTION 'bot_idempotency has % NULL tenant_id rows',       v_bot_idempotency;       END IF;
  IF v_admin_idempotency     > 0 THEN RAISE EXCEPTION 'admin_idempotency has % NULL tenant_id rows',     v_admin_idempotency;     END IF;
  IF v_player_action_snoozes > 0 THEN RAISE EXCEPTION 'player_action_snoozes has % NULL tenant_id rows', v_player_action_snoozes; END IF;
END $$;

COMMIT;

-- Recharge le cache PostgREST pour exposer la nouvelle colonne tenant_id côté API.
NOTIFY pgrst, 'reload schema';
