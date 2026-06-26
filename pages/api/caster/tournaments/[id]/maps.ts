// pages/api/caster/tournaments/[id]/maps.ts
// DEPRECATED legacy alias. Canonical: /api/caster/v1/tournaments/:id/maps.
// Body logic in utils/casterApi.ts. See docs/CASTER_API_CONTRACT.md.

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  handleCasterTournamentMaps,
  markCasterLegacyDeprecated,
} from '@/utils/casterApi';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  markCasterLegacyDeprecated(
    res,
    `/api/caster/v1/tournaments/${id ?? ''}/maps`
  );
  await handleCasterTournamentMaps(req, res, 'caster-tournament-maps');
}
