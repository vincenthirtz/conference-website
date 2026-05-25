-- Migration: ajout de la colonne `dedup_key` sur `event_cues`
-- Date: 2026-05-25
--
-- WHY:
--   Lot 6 (timing/drift) — server-side fallback de l'escalation overrun.
--   Aujourd'hui le hook client `useOverrunWatcher` (executé dans l'onglet
--   Director ouvert) envoie un cue 'urgent' a T+5min de depassement. Si
--   l'onglet n'est PAS ouvert (Director ferme, browser tué), aucun cue
--   n'est cree → casters laissés sans rappel.
--
--   On ajoute un cron Netlify `overrun-watcher-cron` (toutes les 2min,
--   cross-tenant via supabaseAdmin) qui scanne les segments live en
--   overrun >= 5min et insere le meme cue. Latence acceptable : T+5min
--   a T+7min selon le tick.
--
--   Probleme : client + cron peuvent tous les deux tirer pour le meme
--   (runId, segmentId) → duplicate urgent cues spammeraient les casters.
--
--   Solution : `dedup_key text` + partial UNIQUE INDEX. Les deux cotes
--   forment la meme clef logique : `auto-overrun:{runId}:{segmentId}`.
--   Le premier qui ecrit gagne ; le second prend un 23505 et le handler
--   POST le traite comme un succes idempotent (no-op).
--
--   Le partial UNIQUE (WHERE dedup_key IS NOT NULL) preserve les cues
--   manuels du Director (dedup_key NULL) : on ne veut pas empecher le
--   Director de creer plusieurs cues identiques s'il le souhaite, ni
--   imposer un identifiant logique aux creations interactives.
--
-- CAVEATS:
--   - Idempotente : ADD COLUMN IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT
--     EXISTS. Re-application sans effet.
--   - Pas de backfill : aucune ligne historique n'a de dedup_key (NULL),
--     donc l'index part vide. Les anciens cues restent intacts.
--   - L'Idempotency-Key existant cote handler reste utile : il protege
--     contre les retries reseau d'un MEME caller (cache 24h en DB
--     via admin_idempotency). dedup_key, lui, protege contre les
--     ecritures concurrentes de callers DIFFERENTS (client vs cron).
--     Les deux mecanismes sont complementaires, pas redondants.
--   - PostgREST schema cache reload requis (la colonne est exposee dans
--     les SELECT/INSERT via les routes admin/events).

BEGIN;

ALTER TABLE public.event_cues
  ADD COLUMN IF NOT EXISTS dedup_key text;

COMMENT ON COLUMN public.event_cues.dedup_key IS
  'Cle de dedup logique partagee client+cron (ex. auto-overrun:{runId}:{segId}). Partial UNIQUE — un seul cue par dedup_key non-NULL. NULL = pas de dedup (cues manuels Director).';

-- Partial unique : ignore les NULL (cues manuels du Director), enforce
-- l'unicite uniquement sur les cues automatiques portant une clef.
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_cues_dedup_key
  ON public.event_cues (dedup_key)
  WHERE dedup_key IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
