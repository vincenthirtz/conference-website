// pages/api/caster/tournaments/index.ts
// DEPRECATED legacy alias. Canonical route: /api/caster/v1/tournaments.
//
// Kept functional for the Electron caster app (still on the legacy path) but
// stamps Deprecation/Sunset/Link headers. Body logic lives in
// utils/casterApi.ts so v1 and legacy can never drift. See
// docs/CASTER_API_CONTRACT.md.

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  handleCasterTournamentsList,
  markCasterLegacyDeprecated,
} from '@/utils/casterApi';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  markCasterLegacyDeprecated(res, '/api/caster/v1/tournaments');
  await handleCasterTournamentsList(req, res, 'caster-tournaments');
}
