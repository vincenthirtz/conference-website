-- Migration: add `channel` dimension to notification_prefs (push vs email)
-- Date: 2026-06-28
--
-- WHY:
--   notification_prefs jusqu'ici modelise un opt-out par (user_id, event_type)
--   pour le SEUL canal Web Push (cf. create_web_push_tables.sql). On ajoute un
--   canal email generique : un user doit pouvoir desactiver "match.starting"
--   sur email tout en le gardant sur push (et inversement). Le canal devient
--   donc une dimension a part entiere de la cle.
--
--   Modele inchange par ailleurs : "row absente = enabled" (opt-out). Une row
--   n'existe que pour un opt-out explicite (enabled=false) ou un re-opt-in.
--   Le dispatcher (push OU email) query desormais :
--       SELECT 1 FROM notification_prefs
--       WHERE user_id = ? AND event_type = ? AND channel = ? AND enabled = false
--   -> si match, skip ; sinon, envoie.
--
-- WHAT:
--   1. Ajout colonne `channel text NOT NULL DEFAULT 'push'`
--      + CHECK (channel IN ('push','email')).
--   2. Backfill explicite des rows existantes a channel='push' (le DEFAULT le
--      fait deja a l'ADD COLUMN, mais on le re-affirme par securite/idempotence).
--   3. Changement de PRIMARY KEY : (user_id, event_type) -> (user_id, event_type, channel).
--      DESTRUCTIF sur la contrainte PK : on DROP l'ancienne (nom resolu via le
--      catalogue, pas en dur) puis on ADD la nouvelle.
--   4. RLS et index conserves : la PK change ne touche pas les policies (elles
--      portent sur user_id, pas sur la PK) ni idx_notification_prefs_user_id.
--      On re-affirme les 4 policies own-row en idempotent (DROP IF EXISTS +
--      CREATE) pour qu'une re-application reste safe meme si elles divergeaient.
--
-- CAVEATS:
--   - PostgREST schema cache reload REQUIS apres application : la forme de la
--     table (colonne + PK) change. NOTIFY pgrst en fin de migration ; si les
--     ecritures/embeds echouent encore, faire un "Reload schema cache" manuel
--     dans Dashboard Supabase -> Settings -> API.
--   - Idempotente : ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS, et un
--     garde-fou pour ne (re)creer la PK 3-colonnes que si elle n'existe pas
--     deja sous cette forme. Re-appliquer la migration ne casse rien.
--   - Pas de CHECK sur event_type (la liste evolue, validation cote API) —
--     coherent avec create_web_push_tables.sql. Le CHECK ne porte QUE sur le
--     canal, ferme (push|email) et facilement extensible par migration future.

BEGIN;

-- 1) Colonne channel (DEFAULT 'push' couvre les rows existantes a l'ADD).
ALTER TABLE public.notification_prefs
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'push';

-- CHECK ferme sur les canaux supportes. Idempotent via DROP IF EXISTS.
ALTER TABLE public.notification_prefs
  DROP CONSTRAINT IF EXISTS notification_prefs_channel_check;
ALTER TABLE public.notification_prefs
  ADD CONSTRAINT notification_prefs_channel_check
  CHECK (channel IN ('push', 'email'));

-- 2) Backfill explicite : tout NULL/vide eventuel -> 'push' (defensif ; le
--    DEFAULT NOT NULL rend ce cas impossible, mais on l'affirme par securite).
UPDATE public.notification_prefs
  SET channel = 'push'
  WHERE channel IS NULL OR channel = '';

-- 3) Changement de PRIMARY KEY : (user_id, event_type) -> (user_id, event_type, channel).
--    On resout le nom reel de l'ancienne PK via le catalogue (ne pas le coder
--    en dur) et on ne recree la nouvelle que si elle n'existe pas deja sous la
--    forme 3-colonnes (idempotence).
DO $$
DECLARE
  old_pk_name text;
  new_pk_exists boolean;
BEGIN
  -- La PK 3-colonnes est-elle deja en place ?
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint con
    WHERE con.conrelid = 'public.notification_prefs'::regclass
      AND con.contype = 'p'
      AND (
        SELECT array_agg(att.attname::text ORDER BY att.attname::text)
        FROM unnest(con.conkey) AS k(attnum)
        JOIN pg_attribute att
          ON att.attrelid = con.conrelid AND att.attnum = k.attnum
      ) = ARRAY['channel', 'event_type', 'user_id']
  ) INTO new_pk_exists;

  IF NOT new_pk_exists THEN
    -- Drop l'ancienne PK quel que soit son nom.
    SELECT con.conname INTO old_pk_name
    FROM pg_constraint con
    WHERE con.conrelid = 'public.notification_prefs'::regclass
      AND con.contype = 'p';

    IF old_pk_name IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE public.notification_prefs DROP CONSTRAINT %I',
        old_pk_name
      );
    END IF;

    ALTER TABLE public.notification_prefs
      ADD CONSTRAINT notification_prefs_pkey
      PRIMARY KEY (user_id, event_type, channel);
  END IF;
END $$;

-- 4) Index secondaire conserve (re-affirme en idempotent — la PK couvre deja
--    user_id en prefix, mais on garde l'index existant pour ne rien casser).
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user_id
  ON public.notification_prefs (user_id);

-- Commentaires.
COMMENT ON COLUMN public.notification_prefs.channel IS
  'Canal de notification : push (Web Push) ou email. Fait partie de la PK (user_id, event_type, channel) — un opt-out est par canal. Extensible par migration future (sms, etc.).';
COMMENT ON TABLE public.notification_prefs IS
  'Preferences notification par (user, event_type, channel). Modele opt-out : absent = enabled. Une row n''existe que pour un opt-out explicite (ou re-opt-in) sur un canal donne.';

-- RLS : user ne lit/ecrit que ses propres prefs. Re-affirme en idempotent.
ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_prefs_select_own ON public.notification_prefs;
CREATE POLICY notification_prefs_select_own
  ON public.notification_prefs
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notification_prefs_insert_own ON public.notification_prefs;
CREATE POLICY notification_prefs_insert_own
  ON public.notification_prefs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notification_prefs_update_own ON public.notification_prefs;
CREATE POLICY notification_prefs_update_own
  ON public.notification_prefs
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notification_prefs_delete_own ON public.notification_prefs;
CREATE POLICY notification_prefs_delete_own
  ON public.notification_prefs
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

COMMIT;

-- ===========================================================================
-- PostgREST schema cache reload
-- ===========================================================================
-- La forme de notification_prefs change (nouvelle colonne + nouvelle PK).
-- PostgREST doit recharger son cache. Si les upserts/embeds echouent ensuite,
-- faire un "Reload schema cache" manuel dans Dashboard Supabase -> Settings -> API.
NOTIFY pgrst, 'reload schema';
