// Journal des actions notables du cockpit caster — appelant côté navigateur de
// POST /api/admin/caster/audit.
//
// Pourquoi côté client : le cockpit écrit les scènes directement dans Supabase
// et pilote OBS en WebSocket, donc aucune de ces actions ne traverse le serveur.
//
// Politique « best-effort » assumée : une action à l'antenne ne doit JAMAIS
// échouer ni être ralentie parce que le journal est indisponible. On ne renvoie
// donc rien, on n'attend pas la réponse pour continuer, et toute erreur est
// avalée (le serveur log déjà de son côté).

import { logger } from '@/utils/logger';

/** Actions journalisables — miroir de l'allowlist de la route serveur. */
export type CasterAuditAction =
  | 'caster_match_import'
  | 'caster_stream_toggle'
  | 'caster_record_toggle'
  | 'caster_obs_setup_scenes'
  | 'caster_poll_toggle'
  | 'caster_theme_activate';

type AuditInput = {
  action: CasterAuditAction;
  /** Entité concernée (id de scène, de match, de thème). */
  entityId?: string | null;
  /** Contexte libre affiché dans /admin/logs. */
  details?: Record<string, unknown>;
};

/**
 * Journalise sans bloquer l'appelant. À appeler APRÈS que l'action a réussi —
 * un journal d'actions qui n'ont pas eu lieu serait pire que pas de journal.
 */
export function logCasterAction({
  action,
  entityId,
  details,
}: AuditInput): void {
  void fetch('/api/admin/caster/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      ...(entityId ? { entity_id: entityId } : {}),
      ...(details ? { details } : {}),
    }),
  }).catch((err) => {
    logger.error('[caster audit] log failed', err);
  });
}
