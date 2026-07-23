// pages/api/public/newsletter/subscribe.ts
// Public (unauthenticated) double opt-in newsletter subscription.
//
// Flow: POST here with an email → we (re)create a `pending` row carrying a
// random `confirm_token` and send a confirmation email. The subscriber becomes
// `confirmed` only after clicking the link (GET /api/public/newsletter/confirm).
//
// Enumeration-safe by design: we ALWAYS answer 200 { success: true } and never
// reveal whether the address already existed / was already confirmed. Anti-spam
// mirrors /api/public/scrim-requests: honeypot + captcha + per-IP rate limit.

import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { verifyCaptcha } from '@/utils/captcha';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { sendNewsletterConfirmEmail } from '@/utils/email';
import { logger } from '@/utils/logger';

const BodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  source: z.string().trim().max(80).optional(),
  honeypot: z.string().optional(),
  captchaToken: z.string().optional(),
  captchaAnswer: z.string().optional(),
});

/** Origin precedence shared with utils/broadcasts.ts / utils/email.ts. */
function siteOrigin(): string {
  return (
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://owwomenscup.fr'
  ).replace(/\/+$/, '');
}

/** Generic success — the ONLY body this endpoint ever returns on the happy path. */
function ok(res: NextApiResponse) {
  return res.status(200).json({ success: true });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = BodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    // Honeypot is validated below; a malformed/missing email is the only 400.
    return res.status(400).json({ error: 'Email invalide.' });
  }
  const body = parsed.data;

  // Honeypot: a filled hidden field ⇒ bot. Silently drop with a generic 200 so
  // the bot can't tell it was detected.
  if (body.honeypot && body.honeypot.trim().length > 0) {
    return ok(res);
  }

  // Per-IP rate limit (mirrors scrim-requests bucketing).
  if (
    applyRateLimit(
      req,
      res,
      { max: 5, windowMs: 60_000 },
      'newsletter-subscribe'
    )
  ) {
    return;
  }

  // Captcha check (same server-side HMAC challenge as scrim-requests).
  const captchaResult = verifyCaptcha(
    (body.captchaToken || '').toString(),
    (body.captchaAnswer || '').toString()
  );
  if (!captchaResult.valid) {
    return res
      .status(400)
      .json({ error: captchaResult.error || 'Captcha invalide' });
  }

  const email = body.email; // already trimmed + lower-cased by the schema
  const tenantId = DEFAULT_TENANT_ID;
  const source = body.source || 'public';

  // Look up an existing subscriber for this tenant + email (stored lower-cased,
  // matching the unique index on (tenant_id, lower(email))).
  const { data: existing, error: lookupErr } = await supabaseAdmin
    .from('newsletter_subscribers')
    .select('id, status')
    .eq('tenant_id', tenantId)
    .eq('email', email)
    .maybeSingle();

  if (lookupErr) {
    logger.error('[public/newsletter/subscribe] lookup error:', lookupErr);
    // Don't leak internal failures; the caller can safely retry.
    return ok(res);
  }

  // Already confirmed → do nothing, don't resend, don't reveal.
  if (existing && (existing as { status?: string }).status === 'confirmed') {
    return ok(res);
  }

  const confirmToken = crypto.randomBytes(32).toString('hex');
  const nowIso = new Date().toISOString();

  if (existing) {
    // Re-arm an existing pending/unsubscribed row with a fresh token.
    const { error: updateErr } = await supabaseAdmin
      .from('newsletter_subscribers')
      .update({
        status: 'pending',
        confirm_token: confirmToken,
        source,
        updated_at: nowIso,
      })
      .eq('id', (existing as { id: string }).id);

    if (updateErr) {
      logger.error('[public/newsletter/subscribe] update error:', updateErr);
      return ok(res);
    }
  } else {
    const { error: insertErr } = await supabaseAdmin
      .from('newsletter_subscribers')
      .insert({
        tenant_id: tenantId,
        email,
        status: 'pending',
        confirm_token: confirmToken,
        source,
        created_at: nowIso,
        updated_at: nowIso,
      });

    if (insertErr) {
      logger.error('[public/newsletter/subscribe] insert error:', insertErr);
      return ok(res);
    }
  }

  // Send the confirmation email. A send failure must NOT leak (still 200) —
  // the subscriber can request the link again.
  const confirmUrl = `${siteOrigin()}/api/public/newsletter/confirm?token=${confirmToken}`;
  try {
    const result = await sendNewsletterConfirmEmail({ to: email, confirmUrl });
    if (!result.success) {
      logger.error(
        '[public/newsletter/subscribe] email send failed:',
        result.error
      );
    }
  } catch (err) {
    logger.error('[public/newsletter/subscribe] email send threw:', err);
  }

  return ok(res);
}
