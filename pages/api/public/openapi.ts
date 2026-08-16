// GET /api/public/openapi
//
// Machine-readable PUBLIC OpenAPI spec — the `/api/public/*` surface only,
// derived from the canonical `docs/openapi.yaml`. Anonymous, CORS `*`, so third
// parties can import it into Postman / codegen / their own tooling. Mirrors the
// posture of the other `/api/public/v1/*` reads.
//
//   ?format=yaml → text/yaml   (default: application/json)

import type { NextApiRequest, NextApiResponse } from 'next';

import { buildPublicSpec, publicSpecAsYaml } from '@/utils/openapi/publicSpec';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    res
      .status(405)
      .json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
    return;
  }

  // Same envelope as the public v1 reads: 120 req/min/IP.
  if (
    applyRateLimit(req, res, { max: 120, windowMs: 60_000 }, 'public-openapi')
  ) {
    return;
  }

  try {
    // Spec changes only at deploy time — safe to cache hard at the edge.
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');

    const format =
      typeof req.query.format === 'string' ? req.query.format : 'json';
    if (format === 'yaml') {
      res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
      res.status(200).send(publicSpecAsYaml());
      return;
    }

    res.status(200).json(buildPublicSpec());
  } catch (err) {
    logger.error('GET /api/public/openapi failed', err);
    res
      .status(500)
      .json({ error: 'Failed to build public spec', code: 'INTERNAL' });
  }
}
