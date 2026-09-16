// pages/api/admin/tcg/engagement.ts
//
// GET /api/admin/tcg/engagement[?weeks=8] — qui a un paquet qui dort, et
// comment la distribution évolue.
//
// POURQUOI À CÔTÉ DE `/overview`. Cette route-là compte : accordés, ouverts, en
// attente. Trois nombres suffisants pour CONSTATER — 52 paquets sur 58 jamais
// ouverts au 16 septembre 2026 — et inutilisables pour AGIR : aucun ne dit à
// qui parler. Les fusionner aurait fait payer à chaque ouverture du panneau la
// lecture nominative, qui n'a de sens que dans l'onglet qui la montre.
//
// CE QU'ELLE EXPOSE EST NOMINATIF, donc `manage_tcg` — le droit qui ouvre déjà
// la file des photos et la correction de solde — et un scope de TENANT : savoir
// qui traîne chez soi ne dit rien de ce qui se passe ailleurs.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';
import { readTcgEngagement } from '@/utils/tcg/readEngagement';

/** Bornes de la fenêtre de tendance. Deux points suffisent à dire un sens. */
const MIN_WEEKS = 2;
const MAX_WEEKS = 26;
const DEFAULT_WEEKS = 8;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (
    applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'admin-tcg-engage')
  ) {
    return;
  }
  // Nominatif : aucune couche intermédiaire n'en garde copie.
  res.setHeader('Cache-Control', 'private, no-store');

  const raw = req.query.weeks;
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  const weeks = Number.isFinite(parsed)
    ? Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, parsed))
    : DEFAULT_WEEKS;

  const result = await readTcgEngagement(ctx.tenantId, weeks);
  if (!result.ok) {
    logger.error('[admin/tcg/engagement] lecture impossible: %s', result.error);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  return res.status(200).json({
    players: result.value.players,
    weekly: result.value.weekly,
    totals: result.value.totals,
  });
}

export default withStaffRoute(handler, { permission: 'manage_tcg' });
