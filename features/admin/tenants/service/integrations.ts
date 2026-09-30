// features/admin/tenants/service/integrations.ts — clés d'API publiques,
// webhooks sortants, secrets du bot, file des demandes d'onboarding.
//
// SECRETS. Trois réponses révèlent un secret UNE fois (clé d'API émise,
// secret de signature d'un webhook, clé + secret du bot après rotation) :
// elles sont rendues à l'identique, jamais journalisées, et leurs routes
// désactivent l'idempotence — le cache d'idempotence stocke le corps des
// réponses en base, un secret n'y a rien à faire.

import crypto from 'node:crypto';
import * as z from 'zod';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { LegacyAdminError } from '@/utils/admin/errors';
import { isValidUUID } from '@/utils/apiHelpers';
import { mintTenantApiToken } from '@/utils/apiTokens/mintTenantApiToken';
import { invalidateBotApiKeyCache } from '@/utils/botAuth';
import {
  generateWebhookSecret,
  parseWebhookEventTypes,
  WEBHOOK_EVENT_TYPES,
} from '@/utils/webhooks';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository/integrations';
import * as tenantsRepo from '../repository/tenants';
import {
  type StaffScope,
  assertTenantInScope,
  isPlatformOwner,
  requireUuid,
  serverError,
} from './scope';

/* ------------------------------ clés d'API ----------------------------- */

/** GET /api/admin/api-tokens — clés de l'espace ACTIF, nom du créateur résolu. */
export async function listActiveTenantApiTokens(ctx: ServiceContext) {
  const { rows, error } = await repo.listApiTokens(ctx.db, ctx.tenantId);
  if (error) {
    ctx.logger.error('[admin/api-tokens] list error', error, {
      tenantId: ctx.tenantId,
    });
    throw serverError();
  }
  const creatorIds = [
    ...new Set(
      rows.map((r) => r.created_by).filter((v): v is string => Boolean(v))
    ),
  ];
  const nameById = new Map<string, string>();
  if (creatorIds.length > 0) {
    for (const s of await tenantsRepo.listStaffNames(ctx.db, creatorIds)) {
      if (s.display_name) nameById.set(s.id, s.display_name);
    }
  }
  return {
    tokens: rows.map((r) => ({
      ...r,
      created_by_name: r.created_by
        ? (nameById.get(r.created_by) ?? null)
        : null,
    })),
  };
}

/**
 * Émission d'une clé pour `tenantId`. L'émission, sa validation et son
 * journal (`create_api_token`, tenant de la CLÉ) vivent dans
 * `mintTenantApiToken`, partagé par les deux routes d'émission.
 * Le clair n'est rendu qu'ici, une seule fois.
 */
export async function mintApiToken(
  scope: StaffScope,
  tenantId: string,
  body: unknown
) {
  const result = await mintTenantApiToken({
    tenantId,
    actor: {
      staffId: scope.staffId,
      role: scope.role,
      canGrantComp: isPlatformOwner(scope),
    },
    body,
  });
  if (!result.ok) {
    const { error, ...extra } = result.body as { error: string } & Record<
      string,
      unknown
    >;
    throw new LegacyAdminError(result.status, error, { extra });
  }
  return { token: result.token, tokenMeta: result.tokenMeta };
}

const tokenPatchSchema = z
  .object({
    comp: z.boolean().optional(),
    comp_note: z.string().trim().max(500).nullable().optional(),
  })
  .refine((b) => b.comp !== undefined || b.comp_note !== undefined, {
    message: 'Rien à mettre à jour.',
  });

function tokenIdOf(raw: unknown): string {
  return requireUuid(raw, 'Invalid token id.', 'INVALID_TOKEN_ID');
}

/** DELETE /api/admin/api-tokens/[id] — révocation soft, idempotente. */
export async function revokeActiveTenantApiToken(
  ctx: ServiceContext,
  rawId: unknown
): Promise<Audited<{ id: string; revokedAt: string | null }>> {
  const id = tokenIdOf(rawId);
  return revokeToken(ctx, ctx.tenantId, id, {
    lookupLog: '[admin/api-tokens] revoke lookup error',
    updateLog: '[admin/api-tokens] revoke update error',
    notFoundCode: 'UNKNOWN_TOKEN',
  });
}

async function revokeToken(
  ctx: ServiceContext,
  tenantId: string,
  tokenId: string,
  labels: { lookupLog: string; updateLog: string; notFoundCode: string }
): Promise<Audited<{ id: string; revokedAt: string | null }>> {
  const { row, error } = await repo.getApiTokenForRevoke(
    ctx.db,
    tenantId,
    tokenId
  );
  if (error) {
    ctx.logger.error(labels.lookupLog, error, { tenantId });
    throw serverError();
  }
  if (!row) {
    throw new LegacyAdminError(404, 'Token not found.', {
      code: labels.notFoundCode,
    });
  }
  // Déjà révoquée → idempotent, rien au journal.
  if (row.revoked_at) {
    return {
      result: { id: row.id, revokedAt: row.revoked_at },
      audit: { skip: true },
    };
  }
  const revokedAt = new Date().toISOString();
  const { error: updErr } = await repo.revokeApiToken(
    ctx.db,
    tenantId,
    tokenId,
    revokedAt
  );
  if (updErr) {
    ctx.logger.error(labels.updateLog, updErr, { tenantId });
    throw serverError('Failed to revoke token.');
  }
  return {
    result: { id: tokenId, revokedAt },
    audit: {
      entity_type: 'api_token',
      entity_id: tokenId,
      tenant_id: tenantId,
      payload: {
        action: 'revoke_api_token',
        name: row.name,
        prefix: row.token_prefix,
      },
    },
  };
}

/**
 * PATCH /api/admin/api-tokens/[id] — exemption partenaire. Poser
 * `comp = true` exige le pôle-admin ou l'owner GLOBAL (`isPlatformOwner`).
 */
export async function patchActiveTenantApiToken(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown,
  body: unknown
) {
  const id = tokenIdOf(rawId);
  const parsed = tokenPatchSchema.safeParse(body);
  if (!parsed.success) {
    throw new LegacyAdminError(400, 'Invalid body.', { code: 'INVALID_BODY' });
  }
  if (parsed.data.comp === true && !isPlatformOwner(scope)) {
    throw new LegacyAdminError(
      403,
      'Seul un owner peut activer une clé partenaire (comp).',
      { code: 'FORBIDDEN_COMP' }
    );
  }
  const { row, error } = await repo.getApiTokenForPatch(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (error) {
    ctx.logger.error('[admin/api-tokens] patch lookup error', error, {
      tenantId: ctx.tenantId,
    });
    throw serverError();
  }
  if (!row) {
    throw new LegacyAdminError(404, 'Token not found.', {
      code: 'UNKNOWN_TOKEN',
    });
  }
  const update: { comp?: boolean; comp_note?: string | null } = {};
  if (parsed.data.comp !== undefined) update.comp = parsed.data.comp;
  if (parsed.data.comp_note !== undefined)
    update.comp_note = parsed.data.comp_note;
  // Retirer l'exemption efface aussi la note (plus de partenaire).
  if (parsed.data.comp === false && parsed.data.comp_note === undefined) {
    update.comp_note = null;
  }
  const { row: updated, error: updErr } = await repo.updateApiTokenComp(
    ctx.db,
    ctx.tenantId,
    id,
    update
  );
  if (updErr || !updated) {
    ctx.logger.error('[admin/api-tokens] patch update error', updErr, {
      tenantId: ctx.tenantId,
    });
    throw serverError('Failed to update token.');
  }
  return {
    result: { token: updated },
    audit: {
      entity_type: 'api_token',
      entity_id: id,
      payload: {
        action: 'update_api_token_comp',
        name: row.name,
        prefix: row.token_prefix,
        comp: updated.comp === true,
      },
    },
  } satisfies Audited<unknown>;
}

/** GET /api/admin/tenants/[id]/api-tokens — clés d'un espace NOMMÉ. */
export async function listNamedTenantApiTokens(
  ctx: ServiceContext,
  tenantId: string
) {
  const { rows, error } = await repo.listTenantApiTokens(ctx.db, tenantId);
  if (error) {
    ctx.logger.error('[admin/tenants/api-tokens] list error', error, {
      tenantId,
    });
    throw serverError();
  }
  return { tokens: rows };
}

/** DELETE /api/admin/tenants/[id]/api-tokens?tokenId= */
export async function revokeNamedTenantApiToken(
  ctx: ServiceContext,
  tenantId: string,
  rawTokenId: unknown
) {
  const tokenId = typeof rawTokenId === 'string' ? rawTokenId.trim() : '';
  if (!isValidUUID(tokenId)) {
    throw new LegacyAdminError(400, 'tokenId must be a UUID.', {
      code: 'INVALID_TOKEN_ID',
    });
  }
  // Le filtre `tenant_id` n'est pas décoratif : sans lui, une clé d'un AUTRE
  // espace serait révoquée depuis ce hub.
  return revokeToken(ctx, tenantId, tokenId, {
    lookupLog: '[admin/tenants/api-tokens] revoke read error',
    updateLog: '[admin/tenants/api-tokens] revoke error',
    notFoundCode: 'TOKEN_NOT_FOUND',
  });
}

/* ------------------------------ webhooks ------------------------------- */

const webhookCreateSchema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), 'URL doit être http(s).')
    .refine((u) => u.length <= 2000, 'URL trop longue.'),
  event_types: z.array(z.string()).min(1),
  description: z.string().trim().max(200).optional(),
});

const webhookPatchSchema = z.object({ enabled: z.boolean() });

function webhookIdOf(raw: unknown): string {
  return requireUuid(raw, 'Invalid id.', 'INVALID_ID');
}

export async function listWebhookSubscriptions(ctx: ServiceContext) {
  const { rows, error } = await repo.listWebhooks(ctx.db, ctx.tenantId);
  if (error) {
    ctx.logger.error('[admin/webhooks] list error', error, {
      tenantId: ctx.tenantId,
    });
    throw serverError('Server error.');
  }
  return { subscriptions: rows, availableEvents: WEBHOOK_EVENT_TYPES };
}

/** POST /api/admin/webhooks — le `secret` (clair) n'est rendu qu'ici. */
export async function createWebhookSubscription(
  ctx: ServiceContext,
  scope: StaffScope,
  body: unknown
) {
  const parsed = webhookCreateSchema.safeParse(body);
  if (!parsed.success) {
    throw new LegacyAdminError(400, 'Invalid body.', { code: 'INVALID_BODY' });
  }
  const events = parseWebhookEventTypes(parsed.data.event_types);
  if (!events.ok) {
    throw new LegacyAdminError(
      400,
      `Events invalides : ${events.invalid.join(', ')}.`,
      {
        code: 'INVALID_EVENT_TYPES',
        extra: { availableEvents: WEBHOOK_EVENT_TYPES },
      }
    );
  }
  const secret = generateWebhookSecret();
  const { row, error } = await repo.insertWebhook(ctx.db, {
    tenant_id: ctx.tenantId,
    url: parsed.data.url,
    secret,
    event_types: events.types,
    description: parsed.data.description ?? null,
    created_by: scope.staffId,
  });
  if (error || !row) {
    ctx.logger.error('[admin/webhooks] insert error', error, {
      tenantId: ctx.tenantId,
    });
    throw serverError('Failed to create subscription.');
  }
  return {
    result: { secret, subscription: row },
    // Pas de secret au journal.
    audit: {
      entity_type: 'webhook_subscription',
      entity_id: row.id,
      payload: {
        action: 'create_webhook',
        url: row.url,
        event_types: events.types,
      },
    },
  } satisfies Audited<unknown>;
}

export async function setWebhookEnabled(
  ctx: ServiceContext,
  rawId: unknown,
  body: unknown
) {
  const id = webhookIdOf(rawId);
  const parsed = webhookPatchSchema.safeParse(body);
  if (!parsed.success) {
    throw new LegacyAdminError(400, 'Invalid body.', { code: 'INVALID_BODY' });
  }
  // Réactiver remet le compteur d'échecs à zéro (lève un auto-disable).
  const patch = parsed.data.enabled
    ? {
        enabled: true,
        consecutive_failures: 0,
        disabled_at: null,
        last_error: null,
      }
    : { enabled: false, disabled_at: new Date().toISOString() };
  const { row, error } = await repo.updateWebhook(
    ctx.db,
    ctx.tenantId,
    id,
    patch
  );
  if (error) {
    ctx.logger.error('[admin/webhooks] patch error', error, {
      tenantId: ctx.tenantId,
    });
    throw serverError();
  }
  if (!row) {
    throw new LegacyAdminError(404, 'Not found.', { code: 'NOT_FOUND' });
  }
  const action = parsed.data.enabled ? 'enable_webhook' : 'disable_webhook';
  return {
    result: { subscription: row },
    audit: {
      action,
      entity_type: 'webhook_subscription',
      entity_id: id,
      payload: { action },
    },
  } satisfies Audited<unknown>;
}

export async function deleteWebhookSubscription(
  ctx: ServiceContext,
  rawId: unknown
) {
  const id = webhookIdOf(rawId);
  const { row, error } = await repo.deleteWebhook(ctx.db, ctx.tenantId, id);
  if (error) {
    ctx.logger.error('[admin/webhooks] delete error', error, {
      tenantId: ctx.tenantId,
    });
    throw serverError();
  }
  if (!row) {
    throw new LegacyAdminError(404, 'Not found.', { code: 'NOT_FOUND' });
  }
  return {
    result: { ok: true as const },
    audit: {
      entity_type: 'webhook_subscription',
      entity_id: id,
      payload: { action: 'delete_webhook' },
    },
  } satisfies Audited<unknown>;
}

/** GET /api/admin/webhooks/[id]/deliveries — 50 dernières livraisons. */
export async function listDeliveries(ctx: ServiceContext, rawId: unknown) {
  const id = webhookIdOf(rawId);
  // La souscription doit appartenir à l'espace actif.
  const { row, error } = await repo.getWebhookId(ctx.db, ctx.tenantId, id);
  if (error) {
    ctx.logger.error('[admin/webhooks/deliveries] sub lookup error', error);
    throw serverError();
  }
  if (!row) {
    throw new LegacyAdminError(404, 'Not found.', { code: 'NOT_FOUND' });
  }
  const { rows, error: listErr } = await repo.listWebhookDeliveries(
    ctx.db,
    id,
    50
  );
  if (listErr) {
    ctx.logger.error('[admin/webhooks/deliveries] list error', listErr);
    throw serverError();
  }
  return { deliveries: rows };
}

/* ----------------------------- secrets bot ----------------------------- */

/** 48 h : l'ancienne clé reste acceptée le temps de redéployer le bot. */
const GRACE_MS = 48 * 60 * 60 * 1000;

const sha256Hex = (v: string) =>
  crypto.createHash('sha256').update(v).digest('hex');

/** Motif FACULTATIF (jamais bloquant), 500 caractères au plus. */
function rotationReason(body: unknown): string | null {
  const raw = (body as { reason?: unknown } | undefined)?.reason;
  return typeof raw === 'string' ? raw.trim().slice(0, 500) : null;
}

async function requireTenantForSecrets(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown
) {
  const id = requireUuid(rawId, 'Invalid tenant id.', 'INVALID_TENANT_ID');
  // Avant toute lecture : les secrets du bot d'un espace hors périmètre ne
  // se rotent pas (et leur clair ne se lit pas).
  await assertTenantInScope(scope, id);
  const { row, error } = await tenantsRepo.getTenantIdentity(ctx.db, id);
  if (error) {
    ctx.logger.error(
      '[admin/tenants/rotate-secrets] tenant lookup error',
      error
    );
    throw serverError();
  }
  if (!row) {
    throw new LegacyAdminError(404, 'Tenant not found.', {
      code: 'UNKNOWN_TENANT',
    });
  }
  return row;
}

/**
 * POST /api/admin/tenants/[id]/rotate-secrets — rotation SANS coupure : la clé
 * courante devient la précédente, valable 48 h. Les valeurs en clair ne
 * sortent que dans cette réponse.
 */
export async function rotateBotSecrets(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown,
  body: unknown
) {
  const reason = rotationReason(body);
  const tenant = await requireTenantForSecrets(ctx, scope, rawId);
  const id = tenant.id;

  const previousKeyHash = await repo.getCurrentBotKeyHash(ctx.db, id);
  const botApiKey = crypto.randomBytes(32).toString('hex');
  const botWebhookSecret = crypto.randomBytes(32).toString('hex');
  const rotatedAt = new Date().toISOString();

  const { error } = await repo.upsertTenantSecrets(ctx.db, {
    tenant_id: id,
    bot_api_key_hash: sha256Hex(botApiKey),
    bot_webhook_secret: botWebhookSecret,
    rotated_at: rotatedAt,
    previous_key_hash: previousKeyHash,
    previous_key_expires_at: previousKeyHash
      ? new Date(Date.now() + GRACE_MS).toISOString()
      : null,
  });
  if (error) {
    ctx.logger.error('[admin/tenants/rotate-secrets] upsert error', error, {
      tenantId: id,
    });
    throw serverError('Failed to persist new secrets.');
  }
  // La clé remplacée ne doit pas survivre dans le cache d'authentification.
  invalidateBotApiKeyCache(id);

  return {
    result: {
      tenantId: id,
      botApiKey,
      botWebhookSecret,
      rotatedAt,
      previousKeyValidUntil: previousKeyHash
        ? new Date(Date.now() + GRACE_MS).toISOString()
        : null,
    },
    // Pas de secret au journal.
    audit: {
      entity_type: 'tenant',
      entity_id: id,
      tenant_id: id,
      payload: {
        action: 'rotate_bot_secrets',
        tenantSlug: tenant.slug,
        previousKeyKeptFor: previousKeyHash ? '48h' : null,
        reason: reason || null,
      },
    },
  } satisfies Audited<unknown>;
}

/** DELETE /api/admin/tenants/[id]/rotate-secrets — révoque la clé précédente MAINTENANT. */
export async function revokePreviousBotKey(
  ctx: ServiceContext,
  scope: StaffScope,
  rawId: unknown,
  body: unknown
) {
  const reason = rotationReason(body);
  const tenant = await requireTenantForSecrets(ctx, scope, rawId);
  const id = tenant.id;
  const { error } = await repo.clearPreviousBotKey(ctx.db, id);
  if (error) {
    ctx.logger.error('[admin/tenants/rotate-secrets] revoke error', error);
    throw serverError('Failed to revoke previous key.');
  }
  invalidateBotApiKeyCache(id);
  return {
    result: { tenantId: id, previousKeyRevoked: true as const },
    audit: {
      action: 'revoke_previous_bot_key',
      entity_type: 'tenant',
      entity_id: id,
      tenant_id: id,
      payload: {
        action: 'revoke_previous_bot_key',
        tenantSlug: tenant.slug,
        reason: reason || null,
      },
    },
  } satisfies Audited<unknown>;
}

/* ------------------------- file d'onboarding --------------------------- */

const REQUEST_STATUSES = [
  'pending_email_verification',
  'pending_bot_invite',
  'completed',
  'rejected',
  'expired',
] as const;
type TenantRequestStatus = (typeof REQUEST_STATUSES)[number];
const PENDING: TenantRequestStatus[] = [
  'pending_email_verification',
  'pending_bot_invite',
];

export type TenantRequestRow = {
  id: string;
  status: TenantRequestStatus;
  requestedSlug: string;
  requestedName: string;
  requesterEmail: string;
  requesterDiscordUserId: string;
  requesterDiscordDisplayName: string | null;
  createdAt: string;
  createdTenantId: string | null;
  createdGuildId: string | null;
  rejectionReason: string | null;
};

function parseInt0(raw: unknown, fallback: number): number {
  if (typeof raw !== 'string') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function requestFilter(raw: unknown): repo.TenantRequestFilter {
  if (typeof raw !== 'string' || raw === '' || raw === 'all')
    return { kind: 'all' };
  if (raw === 'pending') return { kind: 'in', statuses: PENDING };
  return (REQUEST_STATUSES as readonly string[]).includes(raw)
    ? { kind: 'eq', status: raw }
    : { kind: 'all' };
}

/** GET /api/admin/tenant-requests */
export async function listTenantRequests(
  ctx: ServiceContext,
  query: { status?: unknown; limit?: unknown; offset?: unknown }
) {
  const filter = requestFilter(query.status);
  const limit = Math.min(Math.max(parseInt0(query.limit, 20), 1), 100);
  const offset = parseInt0(query.offset, 0);

  const { count, error: countErr } = await repo.countTenantRequests(
    ctx.db,
    filter
  );
  if (countErr) {
    ctx.logger.error('[admin/tenant-requests] count error', countErr);
    throw serverError('Failed to load requests.');
  }
  const { rows, error } = await repo.listTenantRequests(
    ctx.db,
    filter,
    offset,
    limit
  );
  if (error) {
    ctx.logger.error('[admin/tenant-requests] list error', error);
    throw serverError('Failed to load requests.');
  }
  const requests: TenantRequestRow[] = rows.map((r) => ({
    id: r.id,
    status: r.status as TenantRequestStatus,
    requestedSlug: r.requested_slug,
    requestedName: r.requested_name,
    requesterEmail: r.requester_email,
    requesterDiscordUserId: r.requester_discord_user_id,
    requesterDiscordDisplayName: r.requester_discord_display_name,
    createdAt: r.created_at,
    createdTenantId: r.created_tenant_id,
    createdGuildId: r.created_guild_id,
    rejectionReason: r.rejection_reason,
  }));
  return { requests, total: count ?? requests.length, limit, offset };
}

/**
 * POST /api/admin/tenant-requests/[id]/{reject,expire} — sortie manuelle
 * d'une demande `pending_*`. Le jeton de vérification est effacé : un clic
 * tardif ne peut pas la ranimer.
 */
export async function closeTenantRequest(
  ctx: ServiceContext,
  rawId: unknown,
  kind: 'reject' | 'expire',
  body: unknown
) {
  const label = `[admin/tenant-requests/${kind}]`;
  const id = requireUuid(rawId, 'Invalid request id.', 'INVALID_REQUEST_ID');
  let reason = '';
  if (kind === 'reject') {
    const b = (body ?? {}) as Record<string, unknown>;
    reason = typeof b.reason === 'string' ? b.reason.trim() : '';
    if (reason.length < 1 || reason.length > 500) {
      throw new LegacyAdminError(400, 'reason must be 1-500 chars.', {
        code: 'INVALID_REASON',
      });
    }
  }
  const notPending = `Cannot ${kind} a non-pending request.`;

  const { row: existing, error } = await repo.getTenantRequest(ctx.db, id);
  if (error) {
    ctx.logger.error(`${label} lookup error`, error);
    throw serverError();
  }
  if (!existing) {
    throw new LegacyAdminError(404, 'Request not found.', {
      code: 'REQUEST_NOT_FOUND',
    });
  }
  if (!(PENDING as string[]).includes(existing.status)) {
    throw new LegacyAdminError(409, notPending, {
      code: 'NOT_PENDING',
      extra: { currentStatus: existing.status },
    });
  }
  const { row: updated, error: updErr } = await repo.closeTenantRequest(
    ctx.db,
    id,
    PENDING,
    kind === 'reject'
      ? {
          status: 'rejected',
          rejection_reason: reason,
          email_verification_token: null,
        }
      : { status: 'expired', email_verification_token: null }
  );
  if (updErr) {
    ctx.logger.error(`${label} update error`, updErr);
    throw serverError(
      kind === 'reject'
        ? 'Failed to reject the request.'
        : 'Failed to expire the request.'
    );
  }
  if (!updated) {
    // Course perdue : quelqu'un d'autre l'a sortie de `pending_*`.
    throw new LegacyAdminError(409, notPending, { code: 'NOT_PENDING' });
  }
  return {
    result: { id: updated.id, status: updated.status },
    audit: {
      entity_type: 'tenant_request',
      entity_id: id,
      payload:
        kind === 'reject'
          ? {
              action: 'reject_tenant_request',
              requestId: id,
              requestedSlug: existing.requested_slug,
              reason,
            }
          : {
              action: 'expire_tenant_request',
              requestId: id,
              requestedSlug: existing.requested_slug,
            },
    },
  } satisfies Audited<unknown>;
}
