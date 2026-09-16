// pages/api/admin/tcg/catalogue.ts
//
// GET /api/admin/tcg/catalogue[?userId=…] — le catalogue du TCG de l'espace,
// et, quand une joueuse est nommée, lesquelles de ces cartes elle possède.
//
// POURQUOI LE RATTACHEMENT EST REVÉRIFIÉ ICI. `userId` vient du client. Le
// sélecteur qui l'a produit interroge bien une recherche cantonnée à l'espace
// (`admin_search_tcg_players`), mais une route ne se garde pas sur ce que son
// interface a bien voulu envoyer : sans ce contrôle, n'importe quel `manage_tcg`
// — droit que porte tout owner d'espace, y compris un espace développeur créé
// en libre-service — lirait la collection de N'IMPORTE QUEL compte de la
// plateforme. C'est exactement la faille corrigée le 2026-09-15 sur la
// recherche de joueuses et la correction de solde ; on ne la rouvre pas par une
// porte voisine.
//
// UNE COLLECTION EST PERSONNELLE : `Cache-Control: private, no-store`, comme la
// route joueuse. Aucune couche intermédiaire ne doit en garder copie — un
// retrait de consentement sur une photo doit se voir au prochain appel.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';
import { readTcgCatalogue } from '@/utils/tcg/readTcgCatalogue';
import { isUserAttachedToTenant } from '@/utils/tcg/tenantAttachment';

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
    applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'admin-tcg-catalog')
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'private, no-store');

  const raw = req.query.userId;
  const userId = typeof raw === 'string' ? raw.trim() : '';
  if (userId && !isValidUUID(userId)) {
    return res
      .status(400)
      .json({ error: 'userId invalide.', code: 'INVALID_USER_ID' });
  }

  if (userId) {
    const attached = await isUserAttachedToTenant(ctx.tenantId, userId);
    // `null` = lecture en échec, PAS « non rattachée ». Les confondre ferait
    // annoncer « joueuse introuvable » sur une panne de base, et on chercherait
    // le problème du mauvais côté.
    if (attached === null) {
      logger.error('[admin/tcg/catalogue] rattachement illisible');
      return res.status(500).json({ error: 'Lecture impossible.' });
    }
    if (!attached) {
      // 404 et non 403 : répondre « interdit » confirmerait que ce compte
      // existe ailleurs sur la plateforme.
      return res
        .status(404)
        .json({ error: 'Joueuse introuvable.', code: 'PLAYER_NOT_FOUND' });
    }
  }

  const result = await readTcgCatalogue(ctx.tenantId, userId || null);
  if (!result.ok) {
    logger.error('[admin/tcg/catalogue] lecture impossible: %s', result.error);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  return res.status(200).json({
    cards: result.value.cards,
    total: result.value.cards.length,
    ownedCount: result.value.ownedCount,
    userId: userId || null,
  });
}

export default withStaffRoute(handler, { permission: 'manage_tcg' });
