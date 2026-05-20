// pages/api/checkin/[token].ts
// Public endpoint for redeeming a check-in token.
// - GET   : returns the match/team info (used by the public page to render)
// - POST  : marks the team as checked in (idempotent)
// Both endpoints are public (no auth) but rate-limited per IP.
//
// The same endpoint can be called by Draftbot's slash command (/checkin <token>).

import type { NextApiRequest, NextApiResponse } from 'next';
import { applyRateLimit } from '@/utils/rateLimit';
import { resolveCheckinToken, redeemCheckinToken } from '@/utils/checkin';
// TODO(S5c): remplacer DEFAULT_TENANT_ID par le tenantId resolu depuis le
// subdomain/URL une fois la resolution publique multi-tenant en place.
import { DEFAULT_TENANT_ID } from '@/utils/tenant';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'checkin')) {
    return;
  }

  const { token } = req.query;
  if (!token || Array.isArray(token) || typeof token !== 'string') {
    return res.status(400).json({ error: 'Token manquant' });
  }

  if (req.method === 'GET') {
    // TODO(S5c): remplacer DEFAULT_TENANT_ID par le tenantId resolu de l'URL.
    const result = await resolveCheckinToken(DEFAULT_TENANT_ID, token);
    if (!result.ok) {
      return res.status(404).json({ error: result.error });
    }
    return res.status(200).json(result);
  }

  if (req.method === 'POST') {
    // TODO(S5c): remplacer DEFAULT_TENANT_ID par le tenantId resolu de l'URL.
    const result = await redeemCheckinToken(DEFAULT_TENANT_ID, token);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    return res.status(200).json(result);
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
