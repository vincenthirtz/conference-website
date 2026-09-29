// features/admin/tenants/service/guildLinks.ts — rejet et rattachement d'une
// guild Discord en attente (file remplie par `POST /api/bot/v1/tenants/link-guild`).
//
// Codes historiques conservés (`INVALID_GUILD_ID`, `NOT_PENDING`,
// `ALREADY_LINKED`, `INVALID_TENANT_ID`, `TENANT_NOT_FOUND`, `INVALID_SLUG`,
// `INVALID_NAME`, `INVALID_LOCALE`, `DUPLICATE_SLUG`, `TENANT_CREATE_FAILED`,
// `MISSING_TARGET`) : l'écran d'onboarding et le bot les lisent.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { LegacyAdminError } from '@/utils/admin/errors';
import { isValidUUID } from '@/utils/apiHelpers';
import { buildTrialFields } from '@/utils/billing/trial';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository/guildLinks';

const GUILD_ID_RE = /^[0-9]{15,25}$/;
const SLUG_RE = /^[a-z0-9-]+$/;
const SLUG_MIN = 2;
const SLUG_MAX = 50;
const NAME_MIN = 1;
const NAME_MAX = 200;
const LOCALE_RE = /^[a-z]{2}(-[A-Z]{2})?$/;

type ResolvedTenant = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  default_locale: string;
};

function assertGuildId(guildId: unknown): string {
  if (!guildId || typeof guildId !== 'string' || !GUILD_ID_RE.test(guildId)) {
    throw new LegacyAdminError(400, 'Invalid guildId.', {
      code: 'INVALID_GUILD_ID',
    });
  }
  return guildId;
}

/** DELETE `/pending-guild-links/[guildId]` : rejette la demande de lien. */
export async function rejectPendingGuild(
  ctx: ServiceContext,
  rawGuildId: unknown
): Promise<Audited<{ deleted: true; guild_id: string }>> {
  const guildId = assertGuildId(rawGuildId);
  const { row, error: lookupErr } = await repo.findPendingGuild(
    ctx.db,
    guildId
  );
  if (lookupErr) {
    ctx.logger.error(
      '[admin/pending-guild-links/[guildId]] lookup error',
      lookupErr
    );
    throw new LegacyAdminError(500, 'Failed to check pending link.');
  }
  if (!row) throw new LegacyAdminError(404, 'No pending link for this guild.');

  const { error } = await repo.deletePendingGuild(ctx.db, guildId);
  if (error) {
    ctx.logger.error(
      '[admin/pending-guild-links/[guildId]] delete error',
      error
    );
    throw new LegacyAdminError(500, 'Failed to delete pending link.');
  }
  return {
    result: { deleted: true, guild_id: guildId },
    audit: { entity_type: 'guild', entity_id: guildId, payload: { guildId } },
  };
}

async function resolveTargetTenant(
  ctx: ServiceContext,
  body: Record<string, unknown>
): Promise<{ tenant: ResolvedTenant; created: boolean }> {
  const tenantId = body.tenant_id;
  const newTenant = body.new_tenant;

  if (typeof tenantId === 'string') {
    if (!isValidUUID(tenantId)) {
      throw new LegacyAdminError(400, 'tenant_id must be a UUID.', {
        code: 'INVALID_TENANT_ID',
      });
    }
    const { row, error } = await repo.findTenantById(ctx.db, tenantId);
    if (error || !row) {
      throw new LegacyAdminError(404, 'Target tenant not found.', {
        code: 'TENANT_NOT_FOUND',
      });
    }
    return { tenant: row as ResolvedTenant, created: false };
  }

  if (newTenant && typeof newTenant === 'object' && !Array.isArray(newTenant)) {
    const nt = newTenant as Record<string, unknown>;
    const slug =
      typeof nt.slug === 'string' ? nt.slug.trim().toLowerCase() : '';
    const name = typeof nt.name === 'string' ? nt.name.trim() : '';
    const defaultLocale =
      typeof nt.default_locale === 'string' && nt.default_locale.trim()
        ? nt.default_locale.trim()
        : 'fr';

    if (
      !SLUG_RE.test(slug) ||
      slug.length < SLUG_MIN ||
      slug.length > SLUG_MAX
    ) {
      throw new LegacyAdminError(
        400,
        'new_tenant.slug must match ^[a-z0-9-]+$ and be 2-50 chars.',
        { code: 'INVALID_SLUG' }
      );
    }
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      throw new LegacyAdminError(400, 'new_tenant.name must be 1-200 chars.', {
        code: 'INVALID_NAME',
      });
    }
    if (!LOCALE_RE.test(defaultLocale)) {
      throw new LegacyAdminError(
        400,
        'new_tenant.default_locale must be like "fr".',
        { code: 'INVALID_LOCALE' }
      );
    }

    // Essai gratuit, comme les deux autres chemins de création : un espace
    // créé en rattachant un serveur en attente doit avoir un bot qui répond,
    // pas un plan `discovery` qui le refuse (cf. utils/billing/trial.ts).
    const { row: created, error } = await repo.insertTenant(ctx.db, {
      slug,
      name,
      default_locale: defaultLocale,
      is_active: true,
      ...buildTrialFields(),
    } as Parameters<typeof repo.insertTenant>[1]);
    if (error || !created) {
      const code = (error as { code?: string } | null)?.code;
      if (code === '23505') {
        throw new LegacyAdminError(
          409,
          'A tenant with this slug already exists.',
          {
            code: 'DUPLICATE_SLUG',
          }
        );
      }
      ctx.logger.error(
        '[admin/pending-guild-links/[guildId]/claim] create tenant error',
        error
      );
      throw new LegacyAdminError(500, 'Failed to create the new tenant.', {
        code: 'TENANT_CREATE_FAILED',
      });
    }
    return { tenant: created as ResolvedTenant, created: true };
  }

  throw new LegacyAdminError(
    400,
    'Provide either tenant_id (existing) or new_tenant (to create).',
    { code: 'MISSING_TARGET' }
  );
}

/**
 * POST `…/claim` : rattache la guild à un espace existant ou créé à la volée.
 * INSERT `discord_guilds` puis DELETE du pending (pas de transaction via
 * PostgREST : le delete vient après le succès de l'insert).
 */
export async function claimPendingGuild(
  ctx: ServiceContext,
  rawGuildId: unknown,
  body: Record<string, unknown>,
  staffId: string
): Promise<
  Audited<{ guild_id: string; tenant: ResolvedTenant; created_tenant: boolean }>
> {
  const guildId = assertGuildId(rawGuildId);
  const tag = '[admin/pending-guild-links/[guildId]/claim]';

  const { row: pending, error: pErr } = await repo.findPendingGuild(
    ctx.db,
    guildId
  );
  if (pErr) {
    ctx.logger.error(`${tag} pending lookup error`, pErr);
    throw new LegacyAdminError(500, 'Failed to verify pending state.');
  }
  if (!pending) {
    throw new LegacyAdminError(404, 'No pending link for this guild.', {
      code: 'NOT_PENDING',
    });
  }

  // Déjà lié (course / désynchro) ?
  const { row: existingLink, error: linkErr } = await repo.findLinkedGuild(
    ctx.db,
    guildId
  );
  if (linkErr) {
    ctx.logger.error(`${tag} existing link lookup error`, linkErr);
    throw new LegacyAdminError(500, 'Failed to check existing link.');
  }
  if (existingLink) {
    // On nettoie quand même le pending pour stabiliser l'état.
    await repo.deletePendingGuild(ctx.db, guildId);
    throw new LegacyAdminError(409, 'Guild already linked.', {
      code: 'ALREADY_LINKED',
      extra: { tenant_id: existingLink.tenant_id },
    });
  }

  const resolved = await resolveTargetTenant(ctx, body);

  // `is_primary` seulement si l'espace n'a encore aucun serveur : deux
  // serveurs « principaux » n'ont pas de sens pour les résolveurs du bot.
  const existingGuilds = await repo.countTenantGuilds(
    ctx.db,
    resolved.tenant.id
  );
  const { error: insertErr } = await repo.insertGuildLink(
    ctx.db,
    guildId,
    resolved.tenant.id,
    existingGuilds === 0
  );
  if (insertErr) {
    ctx.logger.error(`${tag} insert guild error`, insertErr);
    throw new LegacyAdminError(500, 'Failed to link the guild.');
  }

  // Espace créé à la volée : son créateur y entre (sinon il ne pourrait pas
  // basculer dessus).
  if (resolved.created) {
    const { error: tsErr } = await repo.upsertTenantStaffAdmin(
      ctx.db,
      resolved.tenant.id,
      staffId
    );
    if (tsErr) ctx.logger.error(`${tag} tenant_staff insert error`, tsErr);
  }

  // DELETE pending (best-effort).
  const { error: delErr } = await repo.deletePendingGuild(ctx.db, guildId);
  if (delErr) ctx.logger.error(`${tag} delete pending error`, delErr);

  return {
    result: {
      guild_id: guildId,
      tenant: resolved.tenant,
      created_tenant: resolved.created,
    },
    audit: {
      entity_type: 'tenant',
      entity_id: resolved.tenant.id,
      payload: {
        guildId,
        tenantSlug: resolved.tenant.slug,
        tenantName: resolved.tenant.name,
        createdTenant: resolved.created,
      },
    },
  };
}
