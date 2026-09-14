// pages/api/admin/tcg/welcome-gift.ts
//
// Le cadeau d'accueil d'une édition : le SIMULER, puis le distribuer.
//
//   GET  — combien de comptes seraient crédités, combien le sont déjà.
//   POST — distribue réellement.
//
// POURQUOI DEUX MÉTHODES PLUTÔT QU'UN SEUL BOUTON. Créditer d'un coup toutes
// les participantes est un acte collectif qu'on ne reprend pas : un paquet
// ouvert ne se rend pas. Annoncer « 58 comptes seront crédités » AVANT de
// laisser cliquer coûte une requête et évite de découvrir le nombre après coup.
//
// L'ATTRIBUTION EST UN GESTE, PAS UN EFFET DE BORD DE DÉPLOIEMENT. La migration
// lève le verrou du schéma ; elle ne distribue rien. Personne ne doit pouvoir
// créditer 58 comptes en poussant du code.
//
// REJOUABLE SANS DOMMAGE. L'idempotence tient à `tcg_wallet_entries` UNIQUE
// (tenant_id, user_id, source_kind, source_ref) avec `source_ref = tournoi`.
// Relancer après l'arrivée d'une joueuse dans un roster ne crédite QUE la
// nouvelle — c'est l'usage prévu, pas un abus.
//
// MÊME PERMISSION QUE LE RESTE DU TCG (`moderate_support`) : c'est l'économie
// du jeu qu'on touche, au même titre que la relecture des photos.

import type { NextApiRequest, NextApiResponse } from 'next';

import { applyRateLimit } from '@/utils/rateLimit';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import { resolveCurrentTournamentId } from '@/utils/currentTournament';
import {
  grantWelcomeGift,
  type WelcomeGiftReport,
} from '@/utils/tcg/grantWelcomeGift';
import { earnReward } from '@/utils/tcg/earnSources';

export type TcgWelcomeGiftState = WelcomeGiftReport & {
  /** L'édition visée, résolue côté serveur. `null` = aucune en cours. */
  tournamentId: string | null;
  /** Ce que reçoit chaque personne, pour que l'écran l'annonce sans le savoir. */
  reward: { coins: number; packs: number };
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'tcg-welcome-gift')
  ) {
    return;
  }

  res.setHeader('Cache-Control', 'private, no-store');

  const tenantId = ctx.tenantId;
  if (!tenantId) {
    return res.status(400).json({ error: 'Espace non résolu.' });
  }

  const reward = earnReward('welcome_gift');

  try {
    // L'édition n'est PAS un paramètre de requête : la faire choisir au client
    // laisserait créditer une édition archivée depuis une URL forgée. Le
    // serveur résout la seule qui ait un sens — celle en cours.
    const tournamentId = await resolveCurrentTournamentId(tenantId);
    if (!tournamentId) {
      return res.status(200).json({
        tournamentId: null,
        eligible: 0,
        alreadyGifted: 0,
        granted: 0,
        packsGranted: 0,
        teams: 0,
        reward,
      } satisfies TcgWelcomeGiftState);
    }

    if (req.method === 'GET') {
      const report = await grantWelcomeGift({
        tenantId,
        tournamentId,
        dryRun: true,
      });
      return res.status(200).json({
        ...report,
        tournamentId,
        reward,
      } satisfies TcgWelcomeGiftState);
    }

    // Aiguillage en forme POSITIVE : c'est ce que lit le garde de dérive
    // OpenAPI, qui ne reconnaît pas un `else` final.
    if (req.method === 'POST') {
      const report = await grantWelcomeGift({ tenantId, tournamentId });

      if (ctx.staff?.id) {
        try {
          await logStaffAction({
            staff_id: ctx.staff.id,
            action: 'tcg_welcome_gift_grant',
            entity_type: 'tournament',
            entity_id: tournamentId,
            tenant_id: tenantId,
            payload: {
              granted: report.granted,
              packsGranted: report.packsGranted,
              eligible: report.eligible,
              alreadyGifted: report.alreadyGifted,
              coins: reward.coins,
            },
          });
        } catch (logErr) {
          logger.error('[tcg/welcome-gift] log error:', logErr);
        }
      }

      return res.status(200).json({
        ...report,
        tournamentId,
        reward,
      } satisfies TcgWelcomeGiftState);
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    logger.error('[tcg/welcome-gift] erreur', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
}

// `withAdminIdempotency` N'EST PAS DÉCORATIF ICI. Le POST crédite d'un coup
// toutes les participantes, et un paquet ouvert ne se rend pas : un double-clic,
// un retry de navigateur ou une coupure réseau partielle ne doivent pas
// distribuer deux fois. Le schéma protège déjà des doublons de PIÈCES (unicité
// sur `source_ref`), mais RIEN ne protège des doublons de PAQUETS — c'est
// justement le trou décrit dans `grantWelcomeGift.ts`. Cette couche ferme la
// fenêtre côté transport, avant même que le handler ne s'exécute.
//
// Seules les réponses 2xx sont mises en cache : un 500 transitoire reste
// rejouable, ce qui est le comportement voulu.
export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'tcg-welcome-gift' }),
  { permission: 'moderate_support' }
);
