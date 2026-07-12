// GET /api/onboard/status/[id]
//
// Polling endpoint used by the front-end on `/onboard/invite-bot/[id]` to
// detect when the bot has been invited and the auto-claim has fired.
//
// Auth: Supabase cookie (Discord OAuth). The signed-in user must match the
// request's requester (`requester_auth_user_id`) — or, as a fallback for
// users who linked Discord without logging into Supabase Auth, the
// `requester_discord_user_id` matches the identity's snowflake.
//
// Returns the bot invite OAuth URL so the UI can (re)render the "Invite the
// bot" CTA without needing extra env vars. Once the request is `completed`,
// also returns the single-use secrets-reveal URL — but ONLY to the verified
// owner (ownership is enforced below) and ONLY while the secrets have not yet
// been consumed. It never returns the raw secrets themselves; the reveal URL
// is a one-shot link consumed by /api/onboard/secrets/[token].

import type { NextApiRequest, NextApiResponse } from 'next';

import { getServerClient, supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { buildBotInviteUrl, getSiteUrl } from '@/utils/onboard';
import { logger } from '@/utils/logger';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DISCORD_ID_RE = /^[0-9]{15,25}$/;

type DiscordIdentityData = {
  provider_id?: string;
  sub?: string;
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
      { max: 60, windowMs: 60_000 },
      'onboard-status'
    )
  ) {
    return;
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible.' });
  }

  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || typeof id !== 'string' || !UUID_RE.test(id)) {
    return res
      .status(400)
      .json({ error: 'Identifiant invalide.', code: 'INVALID_ID' });
  }

  // ---------------------------------------------------------------------
  // 1) Auth
  // ---------------------------------------------------------------------
  const supabase = getServerClient(req, res);
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return res
      .status(401)
      .json({ error: 'Authentification requise.', code: 'UNAUTHENTICATED' });
  }

  // Read the request row first ; ownership check happens against the
  // requester identity afterwards.
  const { data: row, error: selErr } = await supabaseAdmin
    .from('tenant_requests')
    .select(
      'id, status, requester_auth_user_id, requester_discord_user_id, requested_slug, requested_name, created_at, email_verified_at, created_tenant_id, created_guild_id, secrets_reveal_token, secrets_revealed_at'
    )
    .eq('id', id)
    .maybeSingle();

  if (selErr) {
    logger.error('[onboard/status] select error', selErr);
    return res.status(500).json({ error: 'Erreur de lecture.' });
  }
  if (!row) {
    return res
      .status(404)
      .json({ error: 'Demande introuvable.', code: 'NOT_FOUND' });
  }

  // ---------------------------------------------------------------------
  // 2) Ownership check
  //
  // Primary path: requester_auth_user_id matches the signed-in user.
  // Fallback : the signed-in user's Discord identity snowflake matches
  // `requester_discord_user_id` (covers sessions where the auth.user.id
  // changed but the underlying Discord identity is stable).
  // ---------------------------------------------------------------------
  let isOwner = row.requester_auth_user_id === user.id;
  if (!isOwner) {
    const { data: adminUser } = await supabaseAdmin.auth.admin.getUserById(
      user.id
    );
    const discordIdentity = (adminUser?.user?.identities ?? []).find(
      (i) => i.provider === 'discord'
    );
    const identityData = (discordIdentity?.identity_data ??
      {}) as DiscordIdentityData;
    const discordId = identityData.provider_id || identityData.sub || '';
    if (
      DISCORD_ID_RE.test(discordId) &&
      discordId === row.requester_discord_user_id
    ) {
      isOwner = true;
    }
  }

  if (!isOwner) {
    // 404 (not 403) so we don't leak whether the id exists for other users.
    return res
      .status(404)
      .json({ error: 'Demande introuvable.', code: 'NOT_FOUND' });
  }

  return res.status(200).json({
    id: row.id,
    status: row.status,
    requestedSlug: row.requested_slug,
    requestedName: row.requested_name,
    createdAt: row.created_at,
    emailVerifiedAt: row.email_verified_at ?? null,
    // Public fields populated once the bot has been invited and the
    // auto-claim has fired. Useful for the UI to swap to the success page.
    createdTenantId: row.created_tenant_id ?? null,
    createdGuildId: row.created_guild_id ?? null,
    botInviteUrl: buildBotInviteUrl(),
    // Single-use reveal link, surfaced only to the verified owner once the
    // tenant is provisioned and while the secrets are still unconsumed.
    // Opening it consumes the secrets (see /api/onboard/secrets/[token]).
    secretsRevealUrl:
      row.status === 'completed' &&
      row.secrets_reveal_token &&
      !row.secrets_revealed_at
        ? `${getSiteUrl()}/onboard/secrets/${row.secrets_reveal_token}`
        : null,
  });
}
