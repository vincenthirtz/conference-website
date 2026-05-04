// pages/api/teams/[teamId].ts
// GET : retourne les informations complètes d'une équipe par id

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { isValidUUID } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';

import { logger } from '../../../utils/logger';
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'team-detail'))
    return;
  const { teamId } = req.query;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!teamId || Array.isArray(teamId) || !isValidUUID(teamId)) {
    return res.status(400).json({ error: 'Invalid team id' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin non configuré' });
  }

  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('*')
    .eq('id', teamId)
    .maybeSingle();

  if (error || !data) {
    logger.error('GET team error:', error);
    return res.status(404).json({ error: 'Team not found' });
  }

  res.setHeader(
    'Cache-Control',
    'public, s-maxage=300, stale-while-revalidate=120'
  );
  return res.status(200).json({ team: data });
}
