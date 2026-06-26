// pages/api/caster/matches/[id].ts
// DEPRECATED legacy alias. Canonical route: /api/caster/v1/matches/:id.
// Body logic in utils/casterApi.ts. See docs/CASTER_API_CONTRACT.md.

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  handleCasterMatchDetail,
  markCasterLegacyDeprecated,
} from '@/utils/casterApi';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  markCasterLegacyDeprecated(res, `/api/caster/v1/matches/${id ?? ''}`);
  await handleCasterMatchDetail(req, res, 'caster-match');
}
