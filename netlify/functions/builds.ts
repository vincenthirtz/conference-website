import type { Handler } from '@netlify/functions';

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

export const handler: Handler = async () => {
  if (!NETLIFY_SITE_ID || !NETLIFY_API_TOKEN) {
    return {
      statusCode: 503,
      body: JSON.stringify({ error: 'Service unavailable.' }),
    };
  }

  const url = `https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}/builds?per_page=20`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${NETLIFY_API_TOKEN}`,
    },
  });

  if (!res.ok) {
    logger.error('[netlify/builds] API error:', res.status);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Failed to fetch builds.' }),
    };
  }

  const builds = (await res.json()) as Build[];

  // Ne retourner que les champs utiles côté client
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

  return {
    statusCode: 200,
    body: JSON.stringify(sanitized),
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
  };
};
