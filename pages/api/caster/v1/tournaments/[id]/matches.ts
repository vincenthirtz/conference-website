// pages/api/caster/v1/tournaments/[id]/matches.ts
// Canonical: matches for a tournament, for the caster app.
// Shared logic in utils/casterApi.ts. See docs/CASTER_API_CONTRACT.md.

import type { NextApiRequest, NextApiResponse } from 'next';
import { handleCasterTournamentMatches } from '@/utils/casterApi';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await handleCasterTournamentMatches(req, res, 'caster-v1-tournament-matches');
}
