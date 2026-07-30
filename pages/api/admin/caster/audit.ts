// POST /api/admin/caster/audit
//
// Journalise une action NOTABLE du cockpit caster web dans `staff_logs`.
//
// Pourquoi cette route existe : le cockpit (/admin/caster) écrit les scènes
// directement dans Supabase (RLS staff actif) et pilote OBS en WebSocket depuis
// le navigateur — aucune de ces actions ne traverse le serveur, donc rien ne
// peut les tracer côté back. Cette route est le point d'entrée unique du
// journal, et elle réutilise `staff_logs` (déjà consulté dans /admin/logs)
// plutôt que d'introduire un journal parallèle.
//
// L'app desktop, elle, écrit un journal LOCAL (womenscup-caster
// src/main/audit.js) — non partagé. Le web fait mieux sur ce point : le journal
// est commun à toute l'équipe.
//
// Périmètre volontairement restreint : ce sont les actions à effet visible à
// l'antenne ou sur la configuration, PAS chaque frappe de l'auto-save des
// scènes (`caster_scenes.updated_at` suffit pour ça, et le bruit rendrait le
// journal inutilisable).
//
// withStaffRoute(..., 'caster') : même gate que la page.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { applyRateLimit } from '@/utils/rateLimit';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import type { StaffLogAction } from '@/types/staffLogs';

/** Actions acceptées — sous-ensemble strict de StaffLogAction (allowlist). */
const CASTER_AUDIT_ACTIONS = [
  'caster_match_import',
  'caster_stream_toggle',
  'caster_record_toggle',
  'caster_obs_setup_scenes',
  'caster_poll_toggle',
  'caster_theme_activate',
] as const satisfies readonly StaffLogAction[];

const AuditSchema = z.object({
  action: z.enum(CASTER_AUDIT_ACTIONS),
  /** Contexte libre mais borné (nom de scène, match importé, état visé…). */
  details: z.record(z.string(), z.unknown()).optional(),
  /** Entité concernée quand elle existe (id de scène, de match, de thème). */
  entity_id: z.string().trim().max(100).optional(),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Généreux : un show actif génère quelques dizaines d'actions notables par
  // heure, mais un bug de boucle côté client ne doit pas noyer staff_logs.
  if (
    applyRateLimit(req, res, { max: 120, windowMs: 60_000 }, 'caster-audit')
  ) {
    return;
  }

  const parsed = AuditSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid payload.',
      code: 'INVALID_PAYLOAD',
      details: parsed.error.issues,
    });
  }

  const { action, details, entity_id } = parsed.data;

  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action,
      entity_type: 'caster_cockpit',
      entity_id: entity_id ?? null,
      payload: details ?? null,
      tenant_id: ctx.tenantId,
    });
  } catch (err) {
    // Le journal ne doit JAMAIS casser une action à l'antenne : on log côté
    // serveur et on répond 200. Le cockpit n'a rien à rejouer.
    logger.error('[admin/caster/audit] log error', err);
  }

  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({ ok: true });
}

export default withStaffRoute(handler, 'caster');
