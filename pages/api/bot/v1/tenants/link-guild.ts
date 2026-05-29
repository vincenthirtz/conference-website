// POST /api/bot/v1/tenants/link-guild
//
// Called by the bot from its `guildCreate` handler (the bot has just been
// invited onto a new server). Idempotent.
//
// Three response paths :
//
//   1. `discord_guilds` already contains `guild_id` → `already_linked` with
//      the target tenant. The bot can continue normally.
//
//   2. (NEW — onboarding self-service) The provided `owner_discord_id`
//      matches an active `tenant_requests` row in `pending_bot_invite` with
//      a verified email and a fresh (<7d) created_at. We atomically build
//      the whole tenant : tenants → discord_guilds → tenant_secrets → staff
//      (+ tenant_staff owner) → tenant_discord_config row, generate a
//      single-use reveal token (1h TTL), email the operator, and respond
//      `auto_claimed` so the bot tells the user "all set".
//
//   3. No match → fallback: upsert into `pending_guild_links` and respond
//      `pending_admin_link`. An admin will sort it out via /admin/tenants.
//
// Auth: x-api-key. `actorDiscordUserId` is not required.

import crypto from 'crypto';
import type { NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotCrossTenantRequest } from '@/utils/botAuth';
import { logger } from '@/utils/logger';
import { sendOnboardSuccessEmail } from '@/utils/emailOnboard';
import { getSiteUrl } from '@/utils/onboard';

const GUILD_ID_RE = /^[0-9]{15,25}$/;
const OWNER_ID_RE = /^[0-9]{15,25}$/;
const GUILD_NAME_MAX = 200;

/** Tenant requests are auto-claimable for 7 days after creation. */
const REQUEST_TTL_DAYS = 7;

type TenantRequestRow = {
  id: string;
  requester_auth_user_id: string | null;
  requester_discord_user_id: string;
  requester_discord_display_name: string | null;
  requester_email: string;
  requested_slug: string;
  requested_name: string;
};

async function handler(req: BotCrossTenantRequest, res: NextApiResponse) {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const guildId = typeof body.guild_id === 'string' ? body.guild_id.trim() : '';
  if (!guildId || !GUILD_ID_RE.test(guildId)) {
    return res.status(400).json({
      error: 'guild_id requis (snowflake Discord)',
      code: 'INVALID_GUILD_ID',
    });
  }

  const guildName =
    typeof body.guild_name === 'string' && body.guild_name.trim().length > 0
      ? body.guild_name.trim().slice(0, GUILD_NAME_MAX)
      : null;

  let ownerDiscordId: string | null = null;
  if (body.owner_discord_id !== undefined && body.owner_discord_id !== null) {
    if (
      typeof body.owner_discord_id !== 'string' ||
      !OWNER_ID_RE.test(body.owner_discord_id.trim())
    ) {
      return res.status(400).json({
        error: 'owner_discord_id doit etre un snowflake Discord valide',
        code: 'INVALID_OWNER_ID',
      });
    }
    ownerDiscordId = body.owner_discord_id.trim();
  }

  // -----------------------------------------------------------------
  // 1) Already linked ?
  // -----------------------------------------------------------------
  const { data: existing, error: lookupErr } = await supabaseAdmin!
    .from('discord_guilds')
    .select(
      'guild_id, is_primary, tenant:tenants!discord_guilds_tenant_id_fkey(id, slug)'
    )
    .eq('guild_id', guildId)
    .maybeSingle();

  if (lookupErr) {
    logger.error('[bot/tenants/link-guild] lookup error', lookupErr);
    return res.status(500).json({ error: 'Failed to check existing link' });
  }

  if (existing && existing.tenant) {
    const tenant = Array.isArray(existing.tenant)
      ? existing.tenant[0]
      : existing.tenant;
    return res.status(200).json({
      status: 'already_linked',
      guild_id: existing.guild_id,
      is_primary: existing.is_primary,
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
    });
  }

  // -----------------------------------------------------------------
  // 2) Auto-claim path : does `owner_discord_id` match an active
  //    onboarding request ?
  // -----------------------------------------------------------------
  if (ownerDiscordId) {
    const ttlCutoff = new Date(
      Date.now() - REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: request, error: reqErr } = await supabaseAdmin!
      .from('tenant_requests')
      .select(
        'id, requester_auth_user_id, requester_discord_user_id, requester_discord_display_name, requester_email, requested_slug, requested_name'
      )
      .eq('requester_discord_user_id', ownerDiscordId)
      .eq('status', 'pending_bot_invite')
      .not('email_verified_at', 'is', null)
      .gt('created_at', ttlCutoff)
      .maybeSingle();

    if (reqErr) {
      logger.error(
        '[bot/tenants/link-guild] tenant_requests lookup error',
        reqErr
      );
      // Fall through to the pending_admin_link path rather than 500 — we
      // don't want a transient read error to block legitimate bot installs.
    }

    if (request) {
      const result = await autoClaimTenant({
        request: request as TenantRequestRow,
        guildId,
        guildName,
      });
      if (result.ok) {
        return res.status(200).json({
          status: 'auto_claimed',
          tenant_id: result.tenantId,
          tenant_slug: (request as TenantRequestRow).requested_slug,
          guild_id: guildId,
          message: 'Tenant created automatically from onboarding request.',
        });
      }
      // Auto-claim failed mid-way and was rolled back. Surface a 500 so the
      // bot can fall back to manual triage (rather than papering over with
      // pending_admin_link, which would re-trigger the auto-claim attempt
      // on every retry).
      logger.error('[bot/tenants/link-guild] auto-claim failed', {
        requestId: (request as TenantRequestRow).id,
        guildId,
        reason: result.reason,
      });
      return res.status(500).json({
        error: 'Échec de la création automatique du tenant.',
        code: 'AUTO_CLAIM_FAILED',
        reason: result.reason,
      });
    }
  }

  // -----------------------------------------------------------------
  // 3) Unknown : upsert into pending_guild_links (legacy fallback).
  // -----------------------------------------------------------------
  const upsertPayload = {
    guild_id: guildId,
    guild_name: guildName,
    owner_discord_id: ownerDiscordId,
    requested_at: new Date().toISOString(),
  };

  const { error: upsertErr } = await supabaseAdmin!
    .from('pending_guild_links')
    .upsert(upsertPayload, { onConflict: 'guild_id' });

  if (upsertErr) {
    logger.error('[bot/tenants/link-guild] upsert error', upsertErr);
    return res.status(500).json({ error: 'Failed to record pending link' });
  }

  logger.info('[bot/tenants/link-guild] new pending guild link recorded', {
    guild_id: guildId,
    guild_name: guildName,
  });

  return res.status(200).json({
    status: 'pending_admin_link',
    guild_id: guildId,
    guild_name: guildName,
    owner_discord_id: ownerDiscordId,
  });
}

/* -------------------------------------------------------------------------
 * Atomic auto-claim
 *
 * We do not have a `tenant.transaction()` API in supabase-js. To keep
 * failures from leaving orphans (tenant without secrets, discord_guilds
 * row pointing at a deleted tenant…) we drive the inserts in dependency
 * order and roll back manually if any step fails. The rollback is
 * best-effort — if it itself fails we log loudly so an operator can clean
 * up.
 *
 * TODO(infra): move this into a Postgres function `create_tenant_from_request()`
 * to make the whole sequence a single atomic transaction. Until then the
 * `created_tenant_id` column on `tenant_requests` doubles as a marker of
 * partial progress (set last).
 * ----------------------------------------------------------------------- */

type AutoClaimResult =
  | { ok: true; tenantId: string }
  | { ok: false; reason: string };

async function autoClaimTenant(input: {
  request: TenantRequestRow;
  guildId: string;
  guildName: string | null;
}): Promise<AutoClaimResult> {
  const { request, guildId, guildName } = input;
  const admin = supabaseAdmin!;
  // `guildName` is stashed into tenant_discord_config.extras for the admin
  // UI so operators can see the human-friendly name without an extra round
  // trip to Discord. Optional — only set if the bot supplied it.

  let tenantId: string | null = null;
  let createdGuild = false;
  let createdSecrets = false;
  let createdStaffId: string | null = null;
  let stampedTenantStaff = false;
  let createdConfigRow = false;

  const rollback = async (label: string) => {
    logger.warn('[bot/tenants/link-guild] rolling back auto-claim', {
      label,
      tenantId,
      guildId,
    });
    // Order matters : children first.
    if (createdConfigRow) {
      await admin
        .from('tenant_discord_config')
        .delete()
        .eq('guild_id', guildId)
        .then(undefined, (e) =>
          logger.error('[auto-claim/rollback] tenant_discord_config', e)
        );
    }
    if (stampedTenantStaff && tenantId) {
      await admin
        .from('tenant_staff')
        .delete()
        .eq('tenant_id', tenantId)
        .then(undefined, (e) =>
          logger.error('[auto-claim/rollback] tenant_staff', e)
        );
    }
    if (createdStaffId) {
      await admin
        .from('staff')
        .delete()
        .eq('id', createdStaffId)
        .then(undefined, (e) => logger.error('[auto-claim/rollback] staff', e));
    }
    if (createdSecrets && tenantId) {
      await admin
        .from('tenant_secrets')
        .delete()
        .eq('tenant_id', tenantId)
        .then(undefined, (e) =>
          logger.error('[auto-claim/rollback] tenant_secrets', e)
        );
    }
    if (createdGuild) {
      await admin
        .from('discord_guilds')
        .delete()
        .eq('guild_id', guildId)
        .then(undefined, (e) =>
          logger.error('[auto-claim/rollback] discord_guilds', e)
        );
    }
    if (tenantId) {
      await admin
        .from('tenants')
        .delete()
        .eq('id', tenantId)
        .then(undefined, (e) => logger.error('[auto-claim/rollback] tenants', e));
    }
  };

  // 1) tenants
  const { data: tenantRow, error: tenantErr } = await admin
    .from('tenants')
    .insert({
      slug: request.requested_slug,
      name: request.requested_name,
      is_active: true,
    })
    .select('id')
    .single();
  if (tenantErr || !tenantRow) {
    return {
      ok: false,
      reason: `tenants.insert: ${tenantErr?.message ?? 'no row returned'}`,
    };
  }
  tenantId = tenantRow.id as string;

  // 2) discord_guilds
  const { error: guildErr } = await admin.from('discord_guilds').insert({
    guild_id: guildId,
    tenant_id: tenantId,
    is_primary: true,
  });
  if (guildErr) {
    await rollback('discord_guilds.insert');
    return { ok: false, reason: `discord_guilds.insert: ${guildErr.message}` };
  }
  createdGuild = true;

  // 3) tenant_secrets — generate plain values, store the hashed API key.
  const botApiKey = crypto.randomBytes(32).toString('hex');
  const botWebhookSecret = crypto.randomBytes(32).toString('hex');
  const botApiKeyHash = crypto
    .createHash('sha256')
    .update(botApiKey)
    .digest('hex');

  const { error: secretsErr } = await admin.from('tenant_secrets').insert({
    tenant_id: tenantId,
    bot_api_key_hash: botApiKeyHash,
    bot_webhook_secret: botWebhookSecret,
  });
  if (secretsErr) {
    await rollback('tenant_secrets.insert');
    return { ok: false, reason: `tenant_secrets.insert: ${secretsErr.message}` };
  }
  createdSecrets = true;

  // 4) staff — find-or-create for the requester. If they already have a
  //    staff row at a higher rank, we DON'T downgrade.
  let staffId: string | null = null;
  if (request.requester_auth_user_id) {
    const { data: existingStaff, error: staffSelErr } = await admin
      .from('staff')
      .select('id, role')
      .eq('auth_user_id', request.requester_auth_user_id)
      .maybeSingle();
    if (staffSelErr) {
      await rollback('staff.select');
      return { ok: false, reason: `staff.select: ${staffSelErr.message}` };
    }
    if (existingStaff) {
      staffId = existingStaff.id as string;
      // No global-role mutation: tenant_staff is where we'll express that
      // this human owns *this* tenant. The global `staff.role` stays as-is.
    } else {
      const { data: insertedStaff, error: staffInsErr } = await admin
        .from('staff')
        .insert({
          auth_user_id: request.requester_auth_user_id,
          display_name: request.requester_discord_display_name,
          email: request.requester_email,
          role: 'caster', // lowest privilege globally; tenant_staff promotes.
        })
        .select('id')
        .single();
      if (staffInsErr || !insertedStaff) {
        await rollback('staff.insert');
        return {
          ok: false,
          reason: `staff.insert: ${staffInsErr?.message ?? 'no row returned'}`,
        };
      }
      staffId = insertedStaff.id as string;
      createdStaffId = staffId;
    }
  }
  // No auth_user_id : we can't create a staff row (FK requires it). The
  // tenant exists, the user can later be invited via /admin/staff. We log
  // for visibility but continue — the auto-claim still succeeds.
  else {
    logger.warn(
      '[bot/tenants/link-guild] auto-claim without requester_auth_user_id — skipping staff creation',
      { requestId: request.id }
    );
  }

  // 5) tenant_staff (owner) — only if we have a staff row.
  if (staffId) {
    const { error: tsErr } = await admin.from('tenant_staff').insert({
      tenant_id: tenantId,
      staff_id: staffId,
      role: 'owner',
    });
    if (tsErr) {
      await rollback('tenant_staff.insert');
      return { ok: false, reason: `tenant_staff.insert: ${tsErr.message}` };
    }
    stampedTenantStaff = true;
  }

  // 6) tenant_discord_config — empty row, FK target for the admin UI.
  const { error: cfgErr } = await admin
    .from('tenant_discord_config')
    .insert({
      guild_id: guildId,
      extras: guildName ? { guild_name: guildName } : {},
    });
  if (cfgErr) {
    // Soft-fail : the admin UI can create the row on first save. Don't
    // rollback the whole tenant for this.
    logger.warn(
      '[bot/tenants/link-guild] tenant_discord_config insert failed (non-fatal)',
      { error: cfgErr.message }
    );
  } else {
    createdConfigRow = true;
  }

  // 7) Mark the request as completed + stash the reveal token + secrets.
  const revealToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const { error: reqUpdErr } = await admin
    .from('tenant_requests')
    .update({
      status: 'completed',
      created_tenant_id: tenantId,
      created_guild_id: guildId,
      secrets_reveal_token: revealToken,
      secrets_reveal_token_expires_at: expiresAt,
      secrets_revealed_at: null,
      pending_secrets_reveal: {
        botApiKey,
        botWebhookSecret,
      },
    })
    .eq('id', request.id);

  if (reqUpdErr) {
    await rollback('tenant_requests.update');
    return {
      ok: false,
      reason: `tenant_requests.update: ${reqUpdErr.message}`,
    };
  }

  // 8) Send the reveal email. Non-fatal : if Brevo hiccups, the operator
  // can request a resend (TODO V2). The reveal token is in the DB.
  const revealUrl = `${getSiteUrl()}/onboard/secrets/${encodeURIComponent(
    revealToken
  )}`;
  try {
    const emailRes = await sendOnboardSuccessEmail({
      to: request.requester_email,
      displayName: request.requester_discord_display_name,
      tenantName: request.requested_name,
      tenantSlug: request.requested_slug,
      revealUrl,
    });
    if (!emailRes.success) {
      logger.warn(
        '[bot/tenants/link-guild] auto-claim success email failed',
        { requestId: request.id, error: emailRes.error }
      );
    }
  } catch (e) {
    logger.warn('[bot/tenants/link-guild] auto-claim success email threw', e);
  }

  return { ok: true, tenantId };
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 30, key: 'bot-tenants-link-guild' },
  idempotent: true,
  crossTenant: true,
});
