// pages/api/player/agenda.ts
// GET — « mes échéances » : matchs, scrims et date butoir de roster de TOUTES
// mes équipes, triés par date (lot J2 de docs/PLAN-espace-joueur.md).
//
// Volontairement insensible au sélecteur d'équipe : un manager qui encadre
// trois équipes a UN agenda. C'est la seule lecture de l'espace joueur dans ce
// cas — d'où l'absence de `readRequestedTeamId` ici.

import type { NextApiRequest, NextApiResponse } from 'next';
import { applyRateLimit } from '@/utils/rateLimit';
import { withSubjectRoute } from '@/utils/subject';
import { loadPlayerAgenda, type PlayerAgenda } from '@/utils/player/agenda';

export default withSubjectRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PlayerAgenda | { error: string }>,
  { subject }
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'player-agenda')
  ) {
    return;
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const agenda = await loadPlayerAgenda(subject.userId, subject.tenantId);
  res.setHeader('Cache-Control', 'private, max-age=60');
  return res.status(200).json(agenda);
});
