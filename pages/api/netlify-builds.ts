import type { NextApiRequest, NextApiResponse } from 'next';

import { logger } from '../../utils/logger';
const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID;
const NETLIFY_API_TOKEN = process.env.NETLIFY_API_TOKEN;

type Build = {
  id: string;
  state: string;
  error?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  published_at?: string | null;
  deploy_time?: number | null;
  commit_ref?: string | null;
  commit_url?: string | null;
  commit_message?: string | null;
  title?: string | null;
  branch?: string | null;
  context?: string | null;
  deploy_url?: string | null;
  review_id?: string | null;
  review_url?: string | null;
  user_id?: string | null;
  user_name?: string | null;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!NETLIFY_SITE_ID || !NETLIFY_API_TOKEN) {
    return res.status(503).json({
      error: 'Service unavailable.',
    });
  }

  const url = `https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}/builds?per_page=20`;

  const apiRes = await fetch(url, {
    headers: {
      Authorization: `Bearer ${NETLIFY_API_TOKEN}`,
    },
  });

  if (!apiRes.ok) {
    logger.error('[netlify-builds] API error:', apiRes.status);
    return res.status(502).json({ error: 'Failed to fetch builds.' });
  }

  const builds = (await apiRes.json()) as Build[];

  const sanitized = builds.map((b) => ({
    id: b.id,
    state: b.state,
    error: b.error || null,
    created_at: b.created_at || null,
    updated_at: (b as any).updated_at || null,
    published_at: (b as any).published_at || null,
    deploy_time: b.deploy_time ?? null,
    commit_ref: b.commit_ref || null,
    commit_url: b.commit_url || null,
    commit_message: (b as any).commit_message || null,
    title: b.title || null,
    branch: b.branch || null,
    context: b.context || null,
    deploy_url: (b as any).deploy_url || null,
    review_id: (b as any).review_id || null,
    review_url: (b as any).review_url || null,
    user_id: (b as any).user_id || null,
    user_name: (b as any).user_name || null,
  }));

  res.setHeader('Cache-Control', 'no-cache');
  return res.status(200).json(sanitized);
}
