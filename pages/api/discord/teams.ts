import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import slugify from 'slugify';
import { supabaseAdmin } from '@/utils/supabase';

type CreateTeamBody = {
  name?: string;
  short_name?: string | null;
  logo_url?: string | null;
  country?: string | null;
  description?: string | null;
  discord?: string | null;
  website?: string | null;
};

type ApiResponse = { team: Record<string, any> } | { error: string };

const DISCORD_TEAM_SECRET = process.env.DISCORD_TEAM_SECRET;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!DISCORD_TEAM_SECRET) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  const token = extractToken(req);
  if (!token || !safeEqual(token, DISCORD_TEAM_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body: CreateTeamBody = req.body || {};
  const name = (body.name || '').trim();
  if (!name) {
    return res.status(400).json({ error: "Field 'name' is required" });
  }

  const baseSlug =
    slugify(name, { lower: true, strict: true }) ||
    `team-${Date.now().toString(36)}`;

  const attemptPayload = (slug: string) => ({
    name,
    slug,
    short_name: body.short_name?.trim() || null,
    logo_url: body.logo_url?.trim() || null,
    country: body.country?.trim() || null,
    description: body.description?.trim() || null,
    discord: body.discord?.trim() || null,
    website: body.website?.trim() || null,
    is_active: true,
  });

  const maxAttempts = 3;
  let lastError: any = null;

  for (let i = 0; i < maxAttempts; i++) {
    const suffix =
      i === 0 ? '' : `-${Math.random().toString(36).slice(2, 6).toLowerCase()}`;
    const slug = `${baseSlug}${suffix}`;

    const payload = attemptPayload(slug);
    const { data, error } = await supabaseAdmin
      .from('teams')
      .insert(payload)
      .select('*')
      .maybeSingle();

    if (!error && data) {
      // Créer automatiquement une news publiée
      try {
        const newsSlug = `${slug}-creation-${Date.now().toString(36)}`;
        await supabaseAdmin
          .from('news')
          .insert({
            title: `Nouvelle équipe : ${name}`,
            slug: newsSlug,
            tag: 'teams',
            excerpt: `L'équipe ${name} rejoint le tournoi.`,
            content: `Bienvenue à ${name} ! Une nouvelle équipe vient d'être créée pour participer au tournoi. Restez à l'écoute pour suivre ses matchs.`,
            status: 'published',
            published_at: new Date().toISOString(),
          });
      } catch (newsErr) {
        console.error('[/api/discord/teams] create news error:', newsErr);
      }

      return res.status(201).json({ team: data });
    }

    lastError = error;
    const message = error?.message?.toLowerCase() || '';
    const isDuplicate =
      message.includes('duplicate') || message.includes('unique');
    if (!isDuplicate) {
      break;
    }
  }

  console.error('[/api/discord/teams] create error:', lastError);
  return res.status(500).json({
    error:
      lastError?.message ||
      'Failed to create team. Check logs or try a different name/slug.',
  });
}

function extractToken(req: NextApiRequest) {
  const auth = req.headers.authorization;
  const raw = Array.isArray(auth) ? auth[0] : auth;
  if (!raw) return null;
  return raw.startsWith('Bearer ') ? raw.slice(7).trim() : raw.trim();
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
