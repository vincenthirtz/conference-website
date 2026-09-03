// pages/api/public/scrim-requests.ts
// Public (unauthenticated) endpoint to propose a scrim to one of our teams.
// Convention: stored in `demandes` with type='scrim', source='public', user_id=null.
// Contact info lives in payload (requester_name, requester_email, requester_discord).

import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit, getClientIp } from '@/utils/rateLimit';
import { verifyCaptcha } from '@/utils/captcha';
import { isValidUUID } from '@/utils/apiHelpers';
import { notifyScrimRequest } from '@/utils/discord';
import { resolveTenantIdForPublicRequest } from '@/utils/tenant';
import {
  notifyScrimRequestDm,
  notifyScrimRequestEmail,
  formatScrimDateFr,
} from '@/utils/scrimRequestNotify';

import { logger } from '../../../utils/logger';
type Body = {
  targetTeamId?: string;
  targetTeamSlug?: string;
  fromTeamName?: string;
  requesterName?: string;
  requesterEmail?: string;
  requesterDiscord?: string;
  preferredDate?: string;
  format?: string;
  message?: string;
  honeypot?: string;
  captchaToken?: string;
  captchaAnswer?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const LIMITS = {
  fromTeamName: 80,
  requesterName: 80,
  requesterEmail: 200,
  requesterDiscord: 100,
  format: 50,
  message: 1000,
};

function bad(res: NextApiResponse, error: string) {
  return res.status(400).json({ error });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = (req.body || {}) as Body;
  const tenantId = resolveTenantIdForPublicRequest(req);

  // Honeypot and captcha first: cheap rejections for obvious bots, and we
  // don't want failed-validation noise to consume the per-IP rate-limit
  // quota that protects the actual DB write.
  if (body.honeypot && `${body.honeypot}`.trim().length > 0) {
    return bad(res, 'Bot detected');
  }

  const captchaResult = verifyCaptcha(
    (body.captchaToken || '').toString(),
    (body.captchaAnswer || '').toString()
  );
  if (!captchaResult.valid) {
    return bad(res, captchaResult.error || 'Captcha invalide');
  }

  const fromTeamName = (body.fromTeamName || '').toString().trim();
  const requesterName = (body.requesterName || '').toString().trim();
  const requesterEmail = (body.requesterEmail || '').toString().trim();
  const requesterDiscord = body.requesterDiscord
    ? body.requesterDiscord.toString().trim()
    : '';
  const message = body.message ? body.message.toString().trim() : '';
  const format = body.format ? body.format.toString().trim() : '';

  if (!fromTeamName || fromTeamName.length > LIMITS.fromTeamName) {
    return bad(res, "Nom d'équipe demandeuse manquant ou trop long.");
  }
  if (!requesterName || requesterName.length > LIMITS.requesterName) {
    return bad(res, 'Nom du contact manquant ou trop long.');
  }
  if (!requesterEmail || requesterEmail.length > LIMITS.requesterEmail) {
    return bad(res, 'Email manquant ou trop long.');
  }
  if (!EMAIL_RE.test(requesterEmail)) {
    return bad(res, 'Email invalide.');
  }
  if (requesterDiscord && requesterDiscord.length > LIMITS.requesterDiscord) {
    return bad(res, 'Discord trop long.');
  }
  if (message.length > LIMITS.message) {
    return bad(res, `Message trop long (max ${LIMITS.message} caractères).`);
  }
  if (format && format.length > LIMITS.format) {
    return bad(res, 'Format trop long.');
  }

  // Resolve target team by id or by slug (name / short_name fallback, like /team/[slug]).
  const slug = (body.targetTeamSlug || '').toString().trim();
  const teamId = (body.targetTeamId || '').toString().trim();
  if (!teamId && !slug) {
    return bad(res, 'Équipe cible manquante.');
  }

  let target: { id: string; name: string } | null = null;

  if (teamId) {
    if (!isValidUUID(teamId)) {
      return bad(res, 'targetTeamId invalide.');
    }
    const { data } = await supabaseAdmin
      .from('teams')
      .select('id, name')
      .eq('id', teamId)
      .eq('is_active', true)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    target = data ?? null;
  }

  if (!target && slug) {
    if (isValidUUID(slug)) {
      const { data } = await supabaseAdmin
        .from('teams')
        .select('id, name')
        .eq('id', slug)
        .eq('is_active', true)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      target = data ?? null;
    }
    if (!target) {
      const { data } = await supabaseAdmin
        .from('teams')
        .select('id, name')
        .ilike('name', slug)
        .eq('is_active', true)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      target = data ?? null;
    }
    if (!target) {
      const { data } = await supabaseAdmin
        .from('teams')
        .select('id, name')
        .ilike('short_name', slug)
        .eq('is_active', true)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      target = data ?? null;
    }
  }

  if (!target) {
    return bad(res, "L'équipe cible n'existe pas ou n'est pas active.");
  }

  // Validate preferred date (must be a future ISO date)
  let preferredDate: string | null = null;
  if (body.preferredDate) {
    const raw = body.preferredDate.toString().trim();
    if (raw) {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) {
        return bad(res, 'Date invalide.');
      }
      if (d.getTime() < Date.now()) {
        return bad(res, 'La date souhaitée doit être dans le futur.');
      }
      preferredDate = d.toISOString();
    }
  }

  // Dedup: same email + same target team within last 24h.
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { data: existing } = await supabaseAdmin
    .from('demandes')
    .select('id')
    .eq('team_id', target.id)
    .eq('tenant_id', tenantId)
    .eq('type', 'scrim')
    .eq('status', 'pending')
    .gte('created_at', cutoff)
    .filter('payload->>requester_email', 'eq', requesterEmail)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return res.status(409).json({
      error:
        'Une demande de scrim de votre part vers cette équipe est déjà en attente.',
    });
  }

  // Rate-limit the actual write. Placed after validation so that bot/garbage
  // requests don't burn through a real user's quota. Burst allows a few
  // legitimate retries; the daily cap is the abuse guard.
  if (
    applyRateLimit(req, res, { max: 5, windowMs: 60_000 }, 'public-scrim-burst')
  )
    return;
  if (
    applyRateLimit(
      req,
      res,
      { max: 10, windowMs: 24 * 60 * 60_000 },
      'public-scrim-day'
    )
  )
    return;

  const ip = getClientIp(req);
  const ipHash = crypto
    .createHash('sha256')
    .update(`${ip}|${process.env.CAPTCHA_SECRET ?? 'salt'}`)
    .digest('hex');

  const payload: Record<string, unknown> = {
    requester_name: requesterName,
    requester_email: requesterEmail,
    requester_discord: requesterDiscord || null,
    from_team_name: fromTeamName,
    target_team_name: target.name,
    preferred_date: preferredDate,
    format: format || null,
    ip_hash: ipHash,
  };

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('demandes')
    .insert({
      user_id: null,
      team_id: target.id,
      type: 'scrim',
      status: 'pending',
      comment: message || null,
      source: 'public',
      payload,
      tenant_id: tenantId,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    logger.error('[public/scrim-requests] insert error:', insertErr);
    return res.status(500).json({ error: 'Échec de la création.' });
  }

  // Fire-and-forget Discord notification.
  notifyScrimRequest({
    fromTeamName,
    targetTeamName: target.name,
    preferredDate,
    message: message || null,
    requesterDisplayName: requesterName,
    isExternal: true,
  });

  // Email + message privé Discord au capitaine de l'équipe CIBLE (s'ajoutent
  // à l'annonce dans le salon scrims). Fire-and-forget : un échec de
  // notification ne doit jamais casser la réponse 201.
  const notifyArgs = {
    tenantId,
    targetTeamId: target.id,
    opponentName: fromTeamName,
    dateLabel: formatScrimDateFr(preferredDate),
    message: message || null,
    requesterName,
    isExternal: true,
  };
  void notifyScrimRequestEmail(notifyArgs).catch(() => {});
  void notifyScrimRequestDm(notifyArgs).catch(() => {});

  // Return a generic confirmation; don't echo back the row to limit enumeration.
  return res.status(201).json({
    success: true,
    message: `Ta demande de scrim contre "${target.name}" a été envoyée. Le capitaine sera notifié.`,
  });
}
