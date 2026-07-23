// pages/api/public/newsletter/confirm.ts
// Double opt-in confirmation link target. The subscriber clicks the link from
// the confirmation email; we flip their row to `confirmed` and redirect to a
// friendly public thank-you page.
//
// Always redirects (302) — never renders JSON — since it's opened in a browser:
//   - valid token (not unsubscribed) → /newsletter/merci
//   - missing / invalid / not-found  → /newsletter/merci?status=invalid
//
// No captcha (a link click can't carry one) and no rate limit beyond the
// implicit uniqueness of the random token.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

const THANK_YOU_PATH = '/newsletter/merci';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const raw = req.query.token;
  const token = Array.isArray(raw) ? raw[0] : raw;

  if (!token || typeof token !== 'string' || token.length < 16) {
    return res.redirect(302, `${THANK_YOU_PATH}?status=invalid`);
  }

  const { data: row, error: lookupErr } = await supabaseAdmin
    .from('newsletter_subscribers')
    .select('id, status')
    .eq('confirm_token', token)
    .maybeSingle();

  if (lookupErr) {
    logger.error('[public/newsletter/confirm] lookup error:', lookupErr);
    return res.redirect(302, `${THANK_YOU_PATH}?status=invalid`);
  }

  if (!row || (row as { status?: string }).status === 'unsubscribed') {
    return res.redirect(302, `${THANK_YOU_PATH}?status=invalid`);
  }

  const nowIso = new Date().toISOString();
  const { error: updateErr } = await supabaseAdmin
    .from('newsletter_subscribers')
    .update({
      status: 'confirmed',
      confirmed_at: nowIso,
      confirm_token: null,
      updated_at: nowIso,
    })
    .eq('id', (row as { id: string }).id);

  if (updateErr) {
    logger.error('[public/newsletter/confirm] update error:', updateErr);
    return res.redirect(302, `${THANK_YOU_PATH}?status=invalid`);
  }

  return res.redirect(302, THANK_YOU_PATH);
}
