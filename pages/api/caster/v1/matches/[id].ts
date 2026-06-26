// pages/api/caster/v1/matches/[id].ts
// Canonical: single match detail + its games, for the caster app.
// Shared logic in utils/casterApi.ts. See docs/CASTER_API_CONTRACT.md.

import type { NextApiRequest, NextApiResponse } from 'next';
import { handleCasterMatchDetail } from '@/utils/casterApi';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await handleCasterMatchDetail(req, res, 'caster-v1-match');
}
