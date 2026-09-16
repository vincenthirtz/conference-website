// pages/api/player/data-export.ts
// GET : exporte toutes les données personnelles de l'utilisateur (droit d'accès RGPD)
//
// Les tables exportées viennent du registre `utils/player/personalDataTables.ts`,
// le même que lit la suppression de compte : ce que la joueuse télécharge est
// exactement ce que la suppression traitera, et chaque section dit ce qu'il en
// adviendra (`on_account_deletion`). Tous les tenants, comme la suppression.

import type { NextApiRequest, NextApiResponse } from 'next';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { exportPersonalData } from '@/utils/player/exportPersonalData';

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(req, res, { max: 5, windowMs: 60_000 }, 'player-data-export')
  )
    return;

  const { tables, not_exported } = await exportPersonalData(user.id);

  const exportData = {
    exported_at: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
      display_name: user.user_metadata?.display_name ?? null,
      battle_tag: user.user_metadata?.battle_tag ?? null,
      role: user.user_metadata?.role ?? null,
    },
    tables,
    not_exported,
    // Alias de l'ancien format (avant le registre), gardés pour les clients
    // et tests qui les lisent. Mêmes lignes que `tables.<table>.rows`.
    team_membership: tables.team_members?.rows ?? [],
    demandes: tables.demandes?.rows ?? [],
    staff: tables.staff?.rows[0] ?? null,
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="mes-donnees.json"'
  );
  return res.status(200).json(exportData);
});
