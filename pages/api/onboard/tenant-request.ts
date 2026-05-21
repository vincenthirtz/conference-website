// POST /api/onboard/tenant-request
//
// Submit a self-service tenant request. The user must be signed in via
// Supabase Auth (Discord OAuth), pass a valid Cloudflare Turnstile token,
// and not already have a pending request.
//
// On success → row in `tenant_requests` with `status='pending_email_verification'`
// + Brevo email containing a one-time verification link.

import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';

import { getServerClient, supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit, getClientIp } from '@/utils/rateLimit';
import { verifyTurnstileToken } from '@/utils/turnstile';
import { sendOnboardVerifyEmail } from '@/utils/emailOnboard';
import {
  onboardTenantRequestSchema,
  getSiteUrl,
} from '@/utils/onboard';
import { logger } from '@/utils/logger';

const DISCORD_ID_RE = /^[0-9]{15,25}$/;

type DiscordIdentityData = {
  provider_id?: string;
  sub?: string;
  user_name?: string;
  preferred_username?: string;
  full_name?: string;
  name?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 3 submissions per IP per 24h (anti-abuse). Discord-level cap is enforced
  // by the unique partial index on `tenant_requests`.
  if (
    applyRateLimit(
      req,
      res,
      { max: 3, windowMs: 24 * 60 * 60 * 1000 },
      'onboard-tenant-request'
    )
  ) {
    return;
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible.' });
  }

  // ---------------------------------------------------------------------
  // 1) Authenticate the requester via Supabase cookie (Discord OAuth).
  // ---------------------------------------------------------------------
  const supabase = getServerClient(req, res);
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return res.status(401).json({
      error: 'Vous devez être connecté via Discord pour soumettre une demande.',
      code: 'UNAUTHENTICATED',
      hint: '/auth/login?next=/onboard/request',
    });
  }

  // Extract the Discord snowflake from the user's identities. We need it as
  // the natural key for matching against the bot's guildCreate later on.
  const { data: adminUser, error: adminErr } =
    await supabaseAdmin.auth.admin.getUserById(user.id);
  if (adminErr || !adminUser?.user) {
    logger.error('[onboard/tenant-request] admin getUser error', adminErr);
    return res.status(500).json({ error: 'Impossible de lire votre profil.' });
  }

  const discordIdentity = (adminUser.user.identities ?? []).find(
    (i) => i.provider === 'discord'
  );
  if (!discordIdentity) {
    return res.status(400).json({
      error:
        "Aucune identité Discord liée à votre compte. Connectez-vous via Discord d'abord.",
      code: 'NO_DISCORD_IDENTITY',
    });
  }
  const identityData = (discordIdentity.identity_data ??
    {}) as DiscordIdentityData;
  const discordUserId = identityData.provider_id || identityData.sub || '';
  if (!DISCORD_ID_RE.test(discordUserId)) {
    return res.status(400).json({
      error: 'Discord user ID invalide.',
      code: 'INVALID_DISCORD_ID',
    });
  }
  const discordDisplayName =
    identityData.user_name ||
    identityData.preferred_username ||
    identityData.full_name ||
    identityData.name ||
    null;

  // ---------------------------------------------------------------------
  // 2) Validate the form payload.
  // ---------------------------------------------------------------------
  const parsed = onboardTenantRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return res.status(400).json({
      error: 'Validation échouée.',
      code: 'INVALID_BODY',
      fields: flat.fieldErrors,
    });
  }
  const {
    requested_slug,
    requested_name,
    requested_email,
    description,
    turnstile_token,
  } = parsed.data;

  // ---------------------------------------------------------------------
  // 3) Cloudflare Turnstile verification.
  // ---------------------------------------------------------------------
  const ip = getClientIp(req);
  const turnstile = await verifyTurnstileToken(
    turnstile_token,
    ip === 'unknown' ? undefined : ip
  );
  if (!turnstile.ok) {
    return res.status(400).json({
      error: turnstile.error ?? 'Captcha invalide.',
      code: 'INVALID_CAPTCHA',
      errorCodes: turnstile.errorCodes,
    });
  }

  // ---------------------------------------------------------------------
  // 4) Generate the one-time email verification token + persist the row.
  // ---------------------------------------------------------------------
  const emailVerificationToken = crypto.randomBytes(32).toString('hex');
  const userAgent = (req.headers['user-agent'] ?? '').toString().slice(0, 500);

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('tenant_requests')
    .insert({
      requester_discord_user_id: discordUserId,
      requester_discord_display_name: discordDisplayName,
      requester_email: requested_email,
      requester_auth_user_id: user.id,
      requested_slug,
      requested_name,
      description: description && description.length > 0 ? description : null,
      status: 'pending_email_verification',
      email_verification_token: emailVerificationToken,
      ip_address: ip !== 'unknown' ? ip : null,
      user_agent: userAgent || null,
    })
    .select('id')
    .single();

  if (insertErr) {
    // Unique constraint violations :
    //   - uq_tenant_requests_active_per_user (1 active request per Discord user)
    //   - uq_tenant_requests_active_slug (no slug claim collision)
    //   - tenants_slug_key on tenants(slug) — collision with an existing tenant
    const message = String(insertErr.message ?? '');
    if (
      insertErr.code === '23505' ||
      message.includes('duplicate key') ||
      message.includes('uq_tenant_requests')
    ) {
      if (message.includes('uq_tenant_requests_active_slug')) {
        return res.status(409).json({
          error:
            'Ce slug est déjà en cours de réservation par une autre demande.',
          code: 'SLUG_TAKEN',
        });
      }
      if (message.includes('uq_tenant_requests_active_per_user')) {
        return res.status(409).json({
          error:
            'Vous avez déjà une demande en cours. Vérifiez vos mails ou contactez le staff.',
          code: 'REQUEST_ALREADY_PENDING',
        });
      }
      return res.status(409).json({
        error: 'Conflit avec une demande existante.',
        code: 'CONFLICT',
      });
    }
    logger.error('[onboard/tenant-request] insert error', insertErr);
    return res.status(500).json({ error: 'Échec de l’enregistrement.' });
  }

  // Pre-existing slug collision against the live `tenants` table : we let
  // the request proceed but warn — the auto-claim step will fail loudly if
  // the collision is still there at that point. Quick sanity check here so
  // we can return a friendly error.
  const { data: existingTenant } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('slug', requested_slug)
    .maybeSingle();
  if (existingTenant) {
    // Roll back the row we just inserted to keep the table clean (we don't
    // want a stale pending request blocking the same user from retrying).
    await supabaseAdmin
      .from('tenant_requests')
      .delete()
      .eq('id', inserted.id);
    return res.status(409).json({
      error: 'Ce slug est déjà utilisé par une organisation existante.',
      code: 'SLUG_TAKEN',
    });
  }

  // ---------------------------------------------------------------------
  // 5) Send the verification email. We don't fail the request if email
  //    delivery hiccups — the row exists and a /api/onboard/resend (TODO,
  //    not in V1 scope) could resend later.
  // ---------------------------------------------------------------------
  const verifyUrl = `${getSiteUrl()}/api/onboard/verify-email?token=${encodeURIComponent(
    emailVerificationToken
  )}`;
  const emailResult = await sendOnboardVerifyEmail({
    to: requested_email,
    displayName: discordDisplayName,
    verifyUrl,
    requestedSlug: requested_slug,
    requestedName: requested_name,
  });
  if (!emailResult.success) {
    logger.warn('[onboard/tenant-request] email send failed', {
      requestId: inserted.id,
      error: emailResult.error,
    });
    // TODO(V2): expose a /api/onboard/resend endpoint so the user can retry.
  }

  return res.status(200).json({
    ok: true,
    requestId: inserted.id,
    status: 'pending_email_verification',
    emailSent: emailResult.success,
  });
}
