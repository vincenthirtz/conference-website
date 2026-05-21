// GET /api/onboard/verify-email?token=...
//
// Verifies the one-time email token sent by /api/onboard/tenant-request.
// On success:
//   - status transitions to `pending_bot_invite`
//   - `email_verified_at` is stamped
//   - `email_verification_token` is wiped (single-use)
//   - the user is redirected to /onboard/invite-bot/[id]
//
// No auth required: the token itself is the secret.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { getSiteUrl } from '@/utils/onboard';
import { logger } from '@/utils/logger';

const TOKEN_RE = /^[a-f0-9]{64}$/i;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'onboard-verify-email'
    )
  ) {
    return;
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible.' });
  }

  const tokenRaw = req.query.token;
  const token = Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw;
  if (!token || typeof token !== 'string' || !TOKEN_RE.test(token)) {
    return res.status(400).json({
      error: 'Token de vérification invalide.',
      code: 'INVALID_TOKEN',
    });
  }

  // Atomic transition : the WHERE clause guarantees we only consume a token
  // that is still in `pending_email_verification`. If a concurrent click
  // already promoted it, the UPDATE matches 0 rows.
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('tenant_requests')
    .update({
      status: 'pending_bot_invite',
      email_verified_at: new Date().toISOString(),
      email_verification_token: null,
    })
    .eq('email_verification_token', token)
    .eq('status', 'pending_email_verification')
    .select('id, requested_slug, requested_name')
    .maybeSingle();

  if (updateErr) {
    logger.error('[onboard/verify-email] update error', updateErr);
    return res.status(500).json({ error: 'Erreur lors de la vérification.' });
  }

  if (!updated) {
    // Either the token never existed, was already consumed, or the row was
    // moved to another state (rejected/expired/completed). Same answer in
    // every case so we don't leak signal.
    return res.status(404).json({
      error: 'Lien de vérification invalide ou déjà utilisé.',
      code: 'INVALID_OR_CONSUMED',
    });
  }

  // Redirect the browser to the bot-invite UI. The page is responsible for
  // rendering the Discord OAuth URL (see `buildBotInviteUrl()` consumed by
  // /api/onboard/status/[id] — UI agent's territory).
  const redirectUrl = `${getSiteUrl()}/onboard/invite-bot/${encodeURIComponent(
    updated.id as string
  )}`;
  res.setHeader('Location', redirectUrl);
  return res.status(302).end();
}
