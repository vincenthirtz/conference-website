// GET /api/onboard/secrets/[token]
//
// Single-use reveal endpoint. Returns the freshly minted bot API key +
// webhook secret to the operator exactly ONCE. After the first hit the
// `pending_secrets_reveal` jsonb is wiped and `secrets_revealed_at` is
// stamped, so a replay yields 410 Gone.
//
// No auth required — the URL token IS the secret. Token lifetime is bounded
// by `secrets_reveal_token_expires_at` (1h, set when the tenant was
// auto-created in /api/bot/v1/tenants/link-guild).
//
// The atomicity strategy:
//   1. SELECT the row by token, read `pending_secrets_reveal` + expiry +
//      `secrets_revealed_at` in one shot.
//   2. Bail out early on missing row / expired / already revealed.
//   3. UPDATE with WHERE secrets_revealed_at IS NULL to atomically claim it.
//      If the update touches 0 rows → another concurrent caller won the
//      race → 410.
//   4. Return the secrets we held in memory from step 1.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';

const TOKEN_RE = /^[a-f0-9]{64}$/i;

type PendingSecrets = {
  botApiKey?: string;
  botWebhookSecret?: string;
};

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
      { max: 20, windowMs: 60_000 },
      'onboard-secrets'
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
      error: 'Token invalide.',
      code: 'INVALID_TOKEN',
    });
  }

  // 1) Read the row in full so we can return secrets after the wipe.
  const { data: row, error: selErr } = await supabaseAdmin
    .from('tenant_requests')
    .select(
      'id, created_tenant_id, requested_slug, requested_name, secrets_reveal_token_expires_at, secrets_revealed_at, pending_secrets_reveal'
    )
    .eq('secrets_reveal_token', token)
    .maybeSingle();

  if (selErr) {
    logger.error('[onboard/secrets] select error', selErr);
    return res.status(500).json({ error: 'Erreur de lecture.' });
  }
  if (!row) {
    return res.status(404).json({
      error: 'Token de récupération invalide.',
      code: 'INVALID_TOKEN',
    });
  }

  // 2) Already consumed → 410.
  if (row.secrets_revealed_at) {
    return res.status(410).json({
      error:
        'Ces secrets ont déjà été consultés. Pour des raisons de sécurité, ils ne peuvent pas être affichés à nouveau.',
      code: 'ALREADY_REVEALED',
    });
  }

  // 3) Expired → 410.
  const expiresAt = row.secrets_reveal_token_expires_at as string | null;
  if (!expiresAt || Date.parse(expiresAt) <= Date.now()) {
    return res.status(410).json({
      error:
        'Le lien de récupération a expiré. Contactez le staff pour en obtenir un nouveau.',
      code: 'EXPIRED',
    });
  }

  // 4) Atomic claim — wipe `pending_secrets_reveal` and stamp the timestamp.
  //    `WHERE secrets_revealed_at IS NULL` makes the update a no-op if a
  //    concurrent caller already won. We .select() back so we can detect 0
  //    rows (rowCount equivalent).
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('tenant_requests')
    .update({
      secrets_revealed_at: new Date().toISOString(),
      pending_secrets_reveal: null,
    })
    .eq('secrets_reveal_token', token)
    .is('secrets_revealed_at', null)
    .select('id');

  if (updateErr) {
    logger.error('[onboard/secrets] update error', updateErr);
    return res.status(500).json({ error: 'Erreur lors de la consultation.' });
  }
  if (!updated || updated.length === 0) {
    // Race lost — another consumer just claimed the token.
    return res.status(410).json({
      error:
        'Ces secrets ont déjà été consultés. Pour des raisons de sécurité, ils ne peuvent pas être affichés à nouveau.',
      code: 'ALREADY_REVEALED',
    });
  }

  // 5) Decode + return the secrets we read in step 1, before the wipe.
  const stash = (row.pending_secrets_reveal ?? {}) as PendingSecrets;
  const botApiKey = stash.botApiKey;
  const botWebhookSecret = stash.botWebhookSecret;
  if (
    typeof botApiKey !== 'string' ||
    typeof botWebhookSecret !== 'string' ||
    botApiKey.length === 0 ||
    botWebhookSecret.length === 0
  ) {
    // Should never happen — auto-claim writes them atomically. Surface as
    // 500 so the operator pings the staff.
    logger.error('[onboard/secrets] reveal row missing secrets', {
      requestId: row.id,
    });
    return res.status(500).json({
      error:
        'Les secrets ne sont pas disponibles. Contactez le staff pour assistance.',
      code: 'MISSING_SECRETS',
    });
  }

  const slug = (row.requested_slug as string | null) ?? null;
  const name = (row.requested_name as string | null) ?? null;

  return res.status(200).json({
    ok: true,
    tenantId: row.created_tenant_id ?? null,
    tenantSlug: slug,
    tenantName: name,
    botApiKey,
    botWebhookSecret,
    instructions: {
      dotEnvSnippet: [
        '# Add to your docker-box bot service .env :',
        `BOT_API_KEY=${botApiKey}`,
        `BOT_WEBHOOK_SECRET=${botWebhookSecret}`,
        `TENANT_ID=${row.created_tenant_id ?? ''}`,
        ...(slug ? [`TENANT_SLUG=${slug}`] : []),
      ].join('\n'),
      reminder:
        'Ces secrets sont affichés une seule fois. Stockez-les dans un coffre.',
    },
  });
}
