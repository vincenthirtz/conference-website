// POST /api/bot/v1/tenants/request-onboard
//
// Discord-native onboarding entry point. Counterpart to the web flow
// (`POST /api/onboard/tenant-request` → email verification → bot invite). A
// user who is already in one of our Discord servers can run the slash command
// `/demander-bot`, which opens a modal and POSTs here. The bot's API key
// proves the channel is trusted; the Discord snowflake proves identity, so
// we skip both Turnstile AND the email-verification round-trip.
//
// On success → a `tenant_requests` row with :
//   - source = 'discord_command'
//   - status = 'pending_bot_invite'  (skip pending_email_verification)
//   - email_verified_at = now()       (Discord proves it for us)
//   - email_verification_token = null (consumed fictively)
//   - requester_auth_user_id = null   (no Supabase Auth in this flow)
//   - ip_address / user_agent = null  (not applicable)
//
// The response carries the bot OAuth invite URL so the bot can DM the user
// "Add me to your server, then we'll auto-create your tenant".
//
// Cross-tenant : no `x-tenant-id` header — the requester doesn't have a
// tenant yet. Same exemption as `/tenants/link-guild`.

import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotCrossTenantRequest } from '@/utils/botAuth';
import { logger } from '@/utils/logger';
import { buildBotInviteUrl, tenantIdentityFields } from '@/utils/onboard';

const DISCORD_ID_RE = /^[0-9]{15,25}$/;

// Wire layer is camelCase (the bot-side contract). We re-export the shared
// validation rules from `tenantIdentityFields` (slug regex + reserved list,
// name 1-200, email lowercased, description max 1000) under their camelCase
// keys so the contract stays in lock-step with the web onboarding form, but
// the bot doesn't have to learn snake_case.
const requestOnboardSchema = z.object({
  requesterDiscordUserId: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .regex(DISCORD_ID_RE, 'Discord user ID invalide (snowflake 15-25 chiffres).')
    ),
  requesterDiscordDisplayName: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (v === null || v === undefined) return null;
      const trimmed = v.trim();
      return trimmed.length > 0 ? trimmed.slice(0, 200) : null;
    }),
  requesterEmail: tenantIdentityFields.requested_email,
  requestedSlug: tenantIdentityFields.requested_slug,
  requestedName: tenantIdentityFields.requested_name,
  description: tenantIdentityFields.description,
});

async function handler(req: BotCrossTenantRequest, res: NextApiResponse) {
  // -----------------------------------------------------------------
  // 1) Validate body.
  // -----------------------------------------------------------------
  const parsed = requestOnboardSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation échouée.',
      code: 'INVALID_BODY',
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const {
    requesterDiscordUserId,
    requesterDiscordDisplayName,
    requestedSlug,
    requestedName,
    requesterEmail,
    description,
  } = parsed.data;

  // -----------------------------------------------------------------
  // 2) Build the bot OAuth invite URL early. If the server is misconfigured
  //    (DISCORD_CLIENT_ID missing), bail before we write anything — there's
  //    no point creating a request the user can't act on.
  // -----------------------------------------------------------------
  const botInviteUrl = buildBotInviteUrl();
  if (!botInviteUrl) {
    logger.error(
      '[bot/tenants/request-onboard] DISCORD_CLIENT_ID unset — cannot build invite URL'
    );
    return res.status(500).json({
      error: 'Le serveur ne peut pas générer le lien d’invitation du bot.',
      code: 'BOT_INVITE_UNAVAILABLE',
    });
  }

  // -----------------------------------------------------------------
  // 3) Pre-check : reject if a tenant already owns this slug. The partial
  //    unique index `uq_tenant_requests_active_slug` covers concurrent
  //    requests for the same slug; this extra check catches collisions
  //    against an *already-created* tenant, which the partial index
  //    doesn't see.
  // -----------------------------------------------------------------
  const { data: existingTenant, error: tenantLookupErr } = await supabaseAdmin!
    .from('tenants')
    .select('id')
    .eq('slug', requestedSlug)
    .maybeSingle();
  if (tenantLookupErr) {
    logger.error(
      '[bot/tenants/request-onboard] tenant lookup error',
      tenantLookupErr
    );
    return res.status(500).json({ error: 'Service indisponible.' });
  }
  if (existingTenant) {
    return res.status(409).json({
      error: 'Ce slug est déjà utilisé par une organisation existante.',
      code: 'SLUG_TAKEN',
    });
  }

  // -----------------------------------------------------------------
  // 4) Insert the tenant_request row. We hop directly to
  //    `pending_bot_invite` because Discord identity is proven by the
  //    bot's API key — no email verification round-trip needed.
  //
  //    `email_verification_token` is left NULL : the column is `UNIQUE`
  //    but Postgres treats NULL as distinct, so multiple rows can coexist.
  // -----------------------------------------------------------------
  const nowIso = new Date().toISOString();
  const { data: inserted, error: insertErr } = await supabaseAdmin!
    .from('tenant_requests')
    .insert({
      requester_discord_user_id: requesterDiscordUserId,
      requester_discord_display_name: requesterDiscordDisplayName,
      requester_email: requesterEmail,
      requester_auth_user_id: null,
      requested_slug: requestedSlug,
      requested_name: requestedName,
      description: description && description.length > 0 ? description : null,
      status: 'pending_bot_invite',
      source: 'discord_command',
      email_verification_token: null,
      email_verified_at: nowIso,
      ip_address: null,
      user_agent: null,
    })
    .select('id')
    .single();

  if (insertErr) {
    const message = String(insertErr.message ?? '');
    // Anti-spam : unique partial index on (requester_discord_user_id) over
    // active statuses. Same handling as the web flow.
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
            'Vous avez déjà une demande en cours. Vérifiez vos messages Discord ou contactez le staff.',
          code: 'REQUEST_ALREADY_PENDING',
        });
      }
      return res.status(409).json({
        error: 'Conflit avec une demande existante.',
        code: 'CONFLICT',
      });
    }
    logger.error('[bot/tenants/request-onboard] insert error', insertErr);
    return res.status(500).json({ error: 'Échec de l’enregistrement.' });
  }

  return res.status(200).json({
    requestId: inserted.id,
    secretsRevealHint: 'user will receive DM with bot invite URL',
    botInviteUrl,
  });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 30, key: 'bot-tenants-request-onboard' },
  idempotent: true,
  crossTenant: true,
});
