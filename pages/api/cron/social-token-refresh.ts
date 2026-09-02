// pages/api/cron/social-token-refresh.ts
//
// Rafraîchit les jetons longue durée des comptes réseaux avant leur échéance.
//
// POURQUOI UN CRON, ET PAS UN RAFRAÎCHISSEMENT PARESSEUX À LA PUBLICATION.
// Le jeton Instagram meurt au bout de ~60 jours, et son rafraîchissement exige
// un jeton ENCORE VALIDE. Un rafraîchissement déclenché « quand on en a besoin »
// ne se produirait qu'à la prochaine publication — or c'est précisément une
// association qui publie par à-coups. Deux mois sans annonce, et le jeton est
// mort : plus aucun rattrapage automatique, il faut re-cliquer le consentement.
//
// On rafraîchit donc dix jours à l'avance (REFRESH_WINDOW_DAYS), tous les jours,
// ce qui laisse dix occasions de réussir avant que ce soit irréversible.
//
// Meta exige aussi que le jeton ait au moins 24 h : un compte tout juste
// connecté est ignoré, et repris le lendemain.
//
// Auth : Bearer CRON_SECRET (header) ou ?secret=... — même pattern que les
// autres crons.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { encryptSecret, decryptSecret } from '@/utils/crypto';
import { logger } from '@/utils/logger';
import { REFRESH_WINDOW_DAYS, refreshToken } from '@/utils/social/instagram';

/** Âge minimal exigé par Meta avant un premier rafraîchissement. */
const MIN_TOKEN_AGE_MS = 24 * 60 * 60 * 1000;

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[cron/social-token-refresh] CRON_SECRET absent — refus');
    return false;
  }
  if (req.headers.authorization === `Bearer ${secret}`) return true;
  const q = req.query.secret;
  return typeof q === 'string' && q === secret;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable' });
  }

  const deadline = new Date(
    Date.now() + REFRESH_WINDOW_DAYS * 86_400_000
  ).toISOString();

  const { data, error } = await supabaseAdmin
    .from('social_accounts')
    .select(
      'id, tenant_id, platform, access_token_encrypted, token_expires_at, connected_at'
    )
    .eq('status', 'connected')
    .lte('token_expires_at', deadline);

  if (error) {
    logger.error('[cron/social-token-refresh] lecture impossible', error);
    return res.status(500).json({ error: 'Query failed' });
  }

  let refreshed = 0;
  let skipped = 0;
  let failed = 0;

  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>;
    const id = String(row.id);

    if (row.platform !== 'instagram') {
      skipped += 1;
      continue;
    }
    if (!row.access_token_encrypted) {
      skipped += 1;
      continue;
    }

    const connectedAt = row.connected_at
      ? new Date(String(row.connected_at)).getTime()
      : 0;
    if (connectedAt && Date.now() - connectedAt < MIN_TOKEN_AGE_MS) {
      // Meta refuse un jeton de moins de 24 h. Ce n'est pas une erreur : on
      // repassera demain.
      skipped += 1;
      continue;
    }

    try {
      const current = decryptSecret(String(row.access_token_encrypted));
      const next = await refreshToken(current);
      await supabaseAdmin
        .from('social_accounts')
        .update({
          access_token_encrypted: encryptSecret(next.accessToken),
          token_expires_at: next.expiresAt.toISOString(),
          status: 'connected',
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      refreshed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failed += 1;
      logger.error(
        '[cron/social-token-refresh] échec compte=%s : %s',
        id,
        message
      );
      // On n'écrit PAS `status: 'expired'` sur un échec isolé : une panne
      // réseau chez Meta marquerait un compte parfaitement valide comme mort,
      // et personne ne le reconnecterait avant de s'en apercevoir. Le statut ne
      // bascule qu'à la publication, quand Meta refuse pour de bon.
      await supabaseAdmin
        .from('social_accounts')
        .update({ last_error: message, updated_at: new Date().toISOString() })
        .eq('id', id);
    }
  }

  return res.status(200).json({ refreshed, skipped, failed });
}
