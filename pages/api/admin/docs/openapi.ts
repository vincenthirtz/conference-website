// pages/api/admin/docs/openapi.ts
//
// Owner-only endpoint serving the canonical OpenAPI spec at
// `docs/openapi.yaml`. Renders the file as `text/yaml` (raw) or
// `application/json` (parsed) depending on the `?format=json` flag —
// Swagger UI can consume either, but YAML is the source of truth.

import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { NextApiRequest, NextApiResponse } from 'next';

import { withStaffRoute } from '@/utils/staff';
import { logger } from '@/utils/logger';

const SPEC_PATH = path.join(process.cwd(), 'docs', 'openapi.yaml');

async function readSpec(): Promise<string> {
  return fs.readFile(SPEC_PATH, 'utf8');
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const yaml = await readSpec();
    const format =
      typeof req.query.format === 'string' ? req.query.format : 'yaml';

    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');

    if (format === 'json') {
      const parsed = parseYaml(yaml);
      res.status(200).json(parsed);
      return;
    }

    res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
    res.status(200).send(yaml);
  } catch (err) {
    logger.error('GET /api/admin/docs/openapi failed', err);
    res.status(500).json({ error: 'Failed to read OpenAPI spec' });
  }
}

export default withStaffRoute(handler, { permission: 'manage_tenant' });
