// pages/api/admin/docs/openapi.ts
//
// Endpoint staff (`manage_tenant`) servant la spec OpenAPI complète, en
// `text/yaml` (défaut) ou `application/json` (`?format=json`). La spec est lue
// via le point d'entrée unique `utils/openapi/loadSpec.ts` (mémorisée).

import { stringify as stringifyYaml } from 'yaml';
import type { NextApiRequest, NextApiResponse } from 'next';

import { withStaffRoute } from '@/utils/staff';
import { logger } from '@/utils/logger';
import { loadFullSpec } from '@/utils/openapi/loadSpec';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const spec = loadFullSpec();
    const format =
      typeof req.query.format === 'string' ? req.query.format : 'yaml';

    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');

    if (format === 'json') {
      res.status(200).json(spec);
      return;
    }

    res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
    res.status(200).send(stringifyYaml(spec));
  } catch (err) {
    logger.error('GET /api/admin/docs/openapi failed', err);
    res.status(500).json({ error: 'Failed to read OpenAPI spec' });
  }
}

export default withStaffRoute(handler, { permission: 'manage_tenant' });
