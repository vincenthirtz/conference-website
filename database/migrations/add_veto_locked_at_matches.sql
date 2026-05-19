-- Migration: veto_locked_at sur matches
--
-- Verrou anti-modification du veto une fois le match commence ou termine.
-- Tant que veto_locked_at est non-null, POST/DELETE sur l'endpoint
-- /api/admin/matches/[matchId]/veto sont refuses (409).
--
-- Auto-set par le site :
--   - quand le status passe a 'ongoing'  (cf. pages/api/admin/matches/[matchId].ts)
--   - quand le status passe a 'finished' ou 'walkover'  (cf. utils/matches/applyScore.ts)
--
-- Reset manuel possible par un admin via PATCH /veto { unlock: true } (cas
-- exceptionnel : correction d'erreur de saisie de veto post-match, le staff
-- doit pouvoir reouvrir).

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS veto_locked_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN matches.veto_locked_at IS
  'Timestamp du verrouillage du veto. Non-null = veto immuable (POST/DELETE refuses). Set automatiquement au passage en ongoing/finished/walkover ; reset via PATCH /veto { unlock: true } (admin only).';

-- Backfill : matches deja en statut terminal sont verrouilles retroactivement,
-- ancres a completed_at quand disponible, sinon now() pour les ongoing.
UPDATE matches
SET veto_locked_at = COALESCE(completed_at, NOW())
WHERE veto_locked_at IS NULL
  AND status IN ('ongoing', 'finished', 'walkover');
