// pages/api/caster/v1/tournaments/index.ts
// Canonical: list of tournaments for the caster app.
// Public read-only, tenant-scoped (x-tenant-id header) via supabaseAdmin.
// Shared logic in utils/casterApi.ts. See docs/CASTER_API_CONTRACT.md.

import type { NextApiRequest, NextApiResponse } from 'next';
import { handleCasterTournamentsList } from '@/utils/casterApi';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await handleCasterTournamentsList(req, res, 'caster-v1-tournaments');
}
