// pages/api/admin/logout.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerClient } from '@/utils/supabase';
import { csrfCheck } from '@/utils/staff';

import { logger } from '../../../utils/logger';
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CSRF : même check Origin/Referer que le wrapper staff standard de
  // utils/staff.ts — sans lui, un site tiers peut forcer la déconnexion
  // cross-site. Les requêtes légitimes (même host, ou Bearer token) passent
  // inchangées.
  if (!csrfCheck(req)) {
    return res.status(403).json({ error: 'Forbidden: origin mismatch' });
  }

  try {
    const supabase = getServerClient(req, res);

    // Supprime la session côté serveur (cookies SSR)
    const { error } = await supabase.auth.signOut();

    if (error) {
      logger.error('[/api/admin/logout] signOut error:', error);
      return res.status(500).json({ error: 'Failed to sign out' });
    }

    // Les cookies sont nettoyés par le client SSR via la réponse
    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error('[/api/admin/logout] internal error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
