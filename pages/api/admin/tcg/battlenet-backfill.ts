// pages/api/admin/tcg/battlenet-backfill.ts
//
// Rattrapage de la récompense « compte Battle.net vérifié » : le SIMULER, puis
// le distribuer.
//
//   GET  — combien de comptes liés et rattachés à l'espace, combien déjà
//          récompensés, combien le seraient, combien de DM Discord partiraient.
//   POST — passe chaque lien par l'écrivain du callback, rend
//          `{ eligible, granted, already, errors, reward }`.
//
// Calqué sur `welcome-gift.ts` : on annonce le nombre AVANT de laisser cliquer,
// la distribution est un geste journalisé, jamais un effet de bord de
// déploiement.
//
// L'AUDIENCE EST L'ESPACE DU STAFF, PAS TOUS LES LIENS. L'index « une fois par
// personne » est global : rattraper depuis un espace une joueuse qui n'y joue
// pas consommerait sa récompense unique au mauvais endroit. Cf.
// `utils/tcg/battlenetBackfill.ts`.
//
// RELANCE SÛRE : les index anti-abus font qu'un second passage ne crédite que
// les comptes liés ou rattachés entre-temps. `withAdminIdempotency` ferme en
// plus la fenêtre d'un double-clic côté transport.
//
// MÊME PERMISSION QUE LE RESTE DU TCG (`manage_tcg`).

import type { NextApiRequest, NextApiResponse } from 'next';

import { applyRateLimit } from '@/utils/rateLimit';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import {
  runBattlenetBackfill,
  simulateBattlenetBackfill,
} from '@/utils/tcg/battlenetBackfill';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 20, windowMs: 60_000 },
      'tcg-battlenet-backfill'
    )
  ) {
    return;
  }

  res.setHeader('Cache-Control', 'private, no-store');

  const tenantId = ctx.tenantId;
  if (!tenantId) {
    return res.status(400).json({ error: 'Espace non résolu.' });
  }

  try {
    if (req.method === 'GET') {
      const simulation = await simulateBattlenetBackfill(tenantId);
      if (!simulation) {
        // Une audience illisible n'est pas une audience vide : annoncer
        // « 0 compte » inviterait à conclure qu'il n'y a rien à rattraper.
        return res.status(500).json({
          error: 'Audience illisible.',
          code: 'AUDIENCE_UNREADABLE',
        });
      }
      return res.status(200).json(simulation);
    }

    // Aiguillage en forme POSITIVE : c'est ce que lit le garde de dérive
    // OpenAPI, qui ne reconnaît pas un `else` final.
    if (req.method === 'POST') {
      const report = await runBattlenetBackfill(tenantId);
      if (!report) {
        // Rien n'a été écrit : l'audience n'a pas pu être lue en entier.
        return res.status(500).json({
          error: 'Audience illisible, rien n’a été distribué.',
          code: 'AUDIENCE_UNREADABLE',
        });
      }

      if (ctx.staff?.id) {
        try {
          await logStaffAction({
            staff_id: ctx.staff.id,
            action: 'tcg_battlenet_backfill',
            entity_type: 'tenant',
            entity_id: tenantId,
            tenant_id: tenantId,
            payload: {
              eligible: report.eligible,
              granted: report.granted,
              already: report.already,
              errors: report.errors,
              coins: report.reward.coins,
            },
          });
        } catch (logErr) {
          logger.error('[tcg/battlenet-backfill] log error:', logErr);
        }
      }

      return res.status(200).json(report);
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    logger.error('[tcg/battlenet-backfill] erreur', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
}

// `withAdminIdempotency` : un double-clic ou un retry navigateur rejoue la
// réponse au lieu de relancer une distribution. Les index du registre
// empêchent déjà tout double crédit ; cette couche évite en plus de refaire
// tout le parcours (et ses lectures) pour rien. Seuls les 2xx sont mis en
// cache, un 500 reste rejouable.
export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'tcg-battlenet-backfill' }),
  { permission: 'manage_tcg' }
);
