// pages/api/admin/tcg/overlay-token.ts
//
// Le lien de la source navigateur OBS du TCG.
//
//   GET    — le lien actif, ou `null` si aucun n'a été émis.
//   POST   — en émet un neuf ET révoque le précédent (donc : « régénérer »).
//   DELETE — révoque, sans en émettre.
//
// POURQUOI RÉGÉNÉRER EST LE GESTE IMPORTANT. Le lien est PORTEUR : quiconque
// l'a voit ce que l'overlay affiche. Il finit collé dans une configuration OBS,
// parfois visible pendant un partage d'écran, parfois transmis entre
// régisseuses. « Régénérer » est donc la réponse à « le lien a circulé », et
// c'est pour cela qu'il n'y a qu'un jeton actif par espace : émettre révoque.
//
// MÊME PERMISSION QUE LE PANNEAU QUI L'HÉBERGE (`moderate_support`, celle de la
// vue d'ensemble TCG). Un lien d'overlay n'est pas un réglage de diffusion : il
// expose des données du TCG, et c'est cette exposition qui décide du seuil.

import type { NextApiRequest, NextApiResponse } from 'next';

import { applyRateLimit } from '@/utils/rateLimit';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import {
  getActiveOverlayToken,
  rotateOverlayToken,
  revokeOverlayToken,
} from '@/utils/tcg/overlayToken';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { logger } from '@/utils/logger';

export type TcgOverlayTokenState = {
  /** URL complète à coller dans OBS, ou `null` si aucun lien actif. */
  url: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
};

function present(
  token: string | null,
  createdAt: string | null,
  lastUsedAt: string | null
): TcgOverlayTokenState {
  if (!token) return { url: null, createdAt: null, lastUsedAt: null };
  return {
    url: absoluteSiteUrl(`/overlay/tcg/${token}`),
    createdAt,
    lastUsedAt,
  };
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'tcg-overlay-token')
  ) {
    return;
  }

  // Un lien porteur ne se met pas en cache, ni côté navigateur ni côté CDN.
  res.setHeader('Cache-Control', 'private, no-store');

  const tenantId = ctx.tenantId;
  if (!tenantId) {
    return res.status(400).json({ error: 'Espace non résolu.' });
  }

  try {
    if (req.method === 'GET') {
      const row = await getActiveOverlayToken(tenantId);
      return res
        .status(200)
        .json(
          present(
            row?.token ?? null,
            row?.created_at ?? null,
            row?.last_used_at ?? null
          )
        );
    }

    if (req.method === 'POST') {
      const token = await rotateOverlayToken(tenantId, ctx.user?.id ?? null);
      if (!token) {
        return res.status(500).json({ error: 'Émission impossible.' });
      }
      if (ctx.staff?.id) {
        // Journalisé SANS le jeton : un journal se relit, un secret ne s'y met
        // pas. Savoir qu'un lien a été régénéré suffit à l'audit.
        try {
          await logStaffAction({
            staff_id: ctx.staff.id,
            action: 'other',
            entity_type: 'broadcast',
            payload: { mode: 'tcg-overlay-token-rotated' },
          });
        } catch (logErr) {
          logger.error('[tcg/overlay-token] log error:', logErr);
        }
      }
      // On relit pour rendre les horodatages réels plutôt que de les deviner.
      const row = await getActiveOverlayToken(tenantId);
      return res
        .status(200)
        .json(
          present(token, row?.created_at ?? null, row?.last_used_at ?? null)
        );
    }

    // Aiguillage en forme POSITIVE pour les TROIS méthodes, plutôt qu'un
    // `DELETE` déduit par élimination en fin de fonction : c'est ce que lit le
    // garde de dérive OpenAPI, et ce qu'un humain lit le plus vite.
    if (req.method === 'DELETE') {
      await revokeOverlayToken(tenantId);
      if (ctx.staff?.id) {
        try {
          await logStaffAction({
            staff_id: ctx.staff.id,
            action: 'other',
            entity_type: 'broadcast',
            payload: { mode: 'tcg-overlay-token-revoked' },
          });
        } catch (logErr) {
          logger.error('[tcg/overlay-token] log error:', logErr);
        }
      }
      return res.status(200).json(present(null, null, null));
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    logger.error('[tcg/overlay-token] erreur', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
}

export default withStaffRoute(handler, { permission: 'moderate_support' });
