-- Migration: expiry + créateur sur `tenant_api_tokens`
-- Date: 2026-07-12
--
-- WHY:
--   Durcissement de la couche clés API publique (« écosystème développeur »).
--   Deux manques :
--     1. Aucune EXPIRATION possible — un token vit jusqu'à révocation manuelle.
--        Pour la rotation (clé de CI, overlay temporaire, accès partenaire à
--        durée limitée) on veut une échéance optionnelle, appliquée à l'auth.
--     2. Aucune TRACE du créateur sur la row — l'info n'existait que dans
--        `staff_logs`. On veut la voir directement dans la liste admin (audit :
--        « qui a émis cette clé »).
--
-- WHAT:
--   - `expires_at timestamptz` (nullable) : NULL = pas d'expiration (comportement
--     actuel). Non-null et passée => token rejeté à l'auth
--     (`resolveApiTokenFromHeader`), au même titre qu'un `revoked_at`.
--   - `created_by uuid` (nullable) : id du staff qui a créé la clé. PAS de FK
--     volontairement — c'est une colonne d'audit ; on ne veut pas coupler la
--     durée de vie de la clé à celle de la row staff (une clé reste valide même
--     si son créateur quitte l'équipe). Le nom est résolu à la lecture via une
--     requête `staff` séparée côté handler admin.
--   - INDEX partiel sur `expires_at` (WHERE non-null) pour un éventuel balayage
--     des clés expirées (monitoring / purge future) sans peser sur les inserts.
--
-- CAVEATS:
--   - Idempotente : `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.
--   - Aucune donnée existante affectée (les deux colonnes sont NULL par défaut ;
--     les clés actuelles restent sans expiration).

BEGIN;

ALTER TABLE public.tenant_api_tokens
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE public.tenant_api_tokens
  ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE INDEX IF NOT EXISTS idx_tenant_api_tokens_expires_at
  ON public.tenant_api_tokens (expires_at)
  WHERE expires_at IS NOT NULL;

COMMENT ON COLUMN public.tenant_api_tokens.expires_at IS
  'Échéance optionnelle. NULL = pas d''expiration. Non-null et passée => token '
  'rejeté à l''auth (comme revoked_at).';
COMMENT ON COLUMN public.tenant_api_tokens.created_by IS
  'Id du staff ayant créé la clé (audit). Pas de FK : colonne d''audit, la clé '
  'survit au départ de son créateur. Nom résolu à la lecture côté handler.';

COMMIT;

-- PostgREST : reload du cache de schéma pour exposer les nouvelles colonnes.
NOTIFY pgrst, 'reload schema';
