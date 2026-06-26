// pages/api/caster/v1/tournaments/[id]/maps.ts
// Canonical: enabled tournament maps, for the caster app.
// Shared logic in utils/casterApi.ts. See docs/CASTER_API_CONTRACT.md.

import type { NextApiRequest, NextApiResponse } from 'next';
import { handleCasterTournamentMaps } from '@/utils/casterApi';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await handleCasterTournamentMaps(req, res, 'caster-v1-tournament-maps');
}
