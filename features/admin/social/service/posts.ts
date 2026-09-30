// features/admin/social/service/posts.ts — composer un post une fois et
// l'envoyer sur plusieurs destinations.
//
// `dryRun` (défaut VRAI) : aperçu par destination, rien n'est publié. Une
// seule destination en erreur refuse tout : on ne publie pas la moitié d'une
// annonce.

import * as z from 'zod';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { LegacyAdminError } from '@/utils/admin/errors';
import {
  SOCIAL_PLATFORMS,
  isSocialPlatformKey,
} from '@/utils/social/platforms';
import { loadAccount } from '@/utils/social/instagram';
import {
  getIntegrationSecret,
  hasIntegrationSecret,
} from '@/utils/integrationSecrets';
import {
  aggregateStatus,
  newsRevalidatePaths,
  publishTargets,
  resolveTargets,
  type SocialTargetInput,
} from '@/utils/social/socialPosts';
import type { AuditDetails } from '@/utils/admin/defineAdminRoute';
import * as repo from '../repository';

const targetSchema = z.object({
  platform: z.string().refine(isSocialPlatformKey, {
    message: 'Destination inconnue.',
  }),
  textOverride: z.string().max(8000).nullable().optional(),
  imageOverride: z.string().url().max(2000).nullable().optional(),
  titleOverride: z.string().max(200).nullable().optional(),
  // Bornes larges : `normalizeHashtags` fait le vrai tri.
  hashtags: z.array(z.string().max(80)).max(50).nullable().optional(),
});

const bodySchema = z.object({
  text: z.string().min(1).max(8000),
  imageUrl: z.string().url().max(2000).nullable().optional(),
  targets: z.array(targetSchema).min(1).max(SOCIAL_PLATFORMS.length),
  // Défaut PRUDENT : sans `dryRun: false` explicite, on ne fait qu'un aperçu.
  dryRun: z.boolean().default(true),
});

type ConnectionState = {
  connected: boolean;
  handle: string | null;
  expiresAt: string | null;
  status: string;
  /** Dernière erreur consignée sur le compte (miroir, publication). */
  lastError?: string | null;
};

/** GET : catalogue des destinations, état des connexions, historique, tags. */
export async function listSocialPosts(
  ctx: ServiceContext,
  q: Record<string, unknown>
) {
  const limit = Math.max(1, Math.min(50, Number(q.limit) || 20));
  const { rows, error } = await repo.listSocialPosts(
    ctx.db,
    ctx.tenantId,
    limit
  );
  if (error) {
    ctx.logger.error('[admin/social-posts] list error', error);
    throw new LegacyAdminError(500, 'Chargement de l’historique impossible.');
  }

  // « à connecter » plutôt qu'une case dont la publication échouerait.
  const connections: Record<string, ConnectionState> = {};
  for (const platform of SOCIAL_PLATFORMS) {
    if (!platform.needsConnection) continue;

    // Bluesky : mot de passe d'application (pas d'expiration à surveiller).
    if (platform.key === 'bluesky') {
      const [handle, hasPassword] = await Promise.all([
        getIntegrationSecret(ctx.tenantId, 'bluesky_handle'),
        hasIntegrationSecret(ctx.tenantId, 'bluesky_app_password'),
      ]);
      connections[platform.key] = {
        connected: Boolean(handle && hasPassword),
        handle: handle ? `@${handle}` : null,
        expiresAt: null,
        status: handle && hasPassword ? 'connected' : 'disconnected',
      };
      continue;
    }

    const account = await loadAccount(ctx.tenantId, platform.key);
    const expiresAt = account?.expiresAt ?? null;
    const expired = Boolean(expiresAt && expiresAt.getTime() < Date.now());
    connections[platform.key] = {
      // `expired` en base = jeton révoqué par Meta, échéance lointaine ou non.
      connected:
        Boolean(account?.accessToken) &&
        !expired &&
        account?.status !== 'expired',
      handle: account?.handle ?? null,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      status: expired ? 'expired' : (account?.status ?? 'disconnected'),
      lastError: account?.lastError ?? null,
    };
  }

  return {
    platforms: SOCIAL_PLATFORMS,
    connections,
    posts: rows,
    knownHashtags: await loadKnownHashtags(ctx),
  };
}

/** Tags déjà employés, par fréquence décroissante. Best-effort. */
async function loadKnownHashtags(ctx: ServiceContext): Promise<string[]> {
  const { rows, error } = await repo.listRecentHashtags(ctx.db, ctx.tenantId);
  if (error) {
    ctx.logger.error('[admin/social-posts] hashtags error', error);
    return [];
  }
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of row.hashtags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 100)
    .map(([tag]) => tag);
}

export type SocialPostOutcome =
  | {
      kind: 'preview';
      body: { dryRun: true; targets: unknown[] };
    }
  | {
      kind: 'published';
      body: {
        dryRun: false;
        postId: string;
        status: string;
        targets: unknown[];
      };
      /** Chemins ISR à revalider (actualité publiée sur le site). */
      revalidate: string[];
      audit: AuditDetails;
    };

export async function composeSocialPost(
  ctx: ServiceContext,
  raw: unknown,
  staffId: string | null
): Promise<SocialPostOutcome> {
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new LegacyAdminError(400, 'Requête invalide.', {
      extra: { details: parsed.error.issues.map((i) => i.message) },
    });
  }
  const input = parsed.data;

  // Deux cibles sur la même plateforme = deux messages identiques.
  const seen = new Set<string>();
  for (const t of input.targets) {
    if (seen.has(t.platform)) {
      throw new LegacyAdminError(
        400,
        `La destination ${t.platform} est présente deux fois.`
      );
    }
    seen.add(t.platform);
  }

  const resolved = resolveTargets(
    { text: input.text, imageUrl: input.imageUrl ?? null },
    input.targets as SocialTargetInput[]
  );
  const preview = resolved.map((t) => ({
    platform: t.platform,
    label: t.label,
    text: t.text,
    imageUrl: t.imageUrl,
    title: t.title,
    error: t.error,
  }));

  if (input.dryRun) {
    return { kind: 'preview', body: { dryRun: true, targets: preview } };
  }

  if (resolved.some((t) => t.error)) {
    throw new LegacyAdminError(
      400,
      'Certaines destinations ne peuvent pas recevoir ce post.',
      { extra: { targets: preview } }
    );
  }

  const { id: postId, error: postError } = await repo.insertSocialPost(ctx.db, {
    tenant_id: ctx.tenantId,
    base_text: input.text,
    base_image_url: input.imageUrl ?? null,
    status: 'publishing',
    created_by: staffId,
  });
  if (postError || !postId) {
    ctx.logger.error('[admin/social-posts] create error', postError);
    throw new LegacyAdminError(500, 'Enregistrement du post impossible.');
  }

  const outcomes = await publishTargets(resolved, {
    tenantId: ctx.tenantId,
    staffId,
    postId,
  });

  const byPlatform = new Map(resolved.map((t) => [t.platform, t]));
  const { error: targetsError } = await repo.insertSocialPostTargets(
    ctx.db,
    outcomes.map((o) => {
      const t = byPlatform.get(o.platform);
      return {
        post_id: postId,
        platform: o.platform,
        text_override: t?.text ?? null,
        image_override: t?.imageUrl ?? null,
        title_override: t?.title ?? null,
        hashtags: t?.hashtags ?? [],
        status: o.status,
        external_id: o.externalId,
        permalink: o.permalink,
        error: o.error,
        attempts: 1,
        sent_at: o.status === 'sent' ? new Date().toISOString() : null,
      };
    })
  );
  if (targetsError) {
    // Les publications ont eu lieu ; seule leur trace a échoué — un
    // opérateur qui recommencerait posterait une seconde fois.
    ctx.logger.error('[admin/social-posts] targets insert error', targetsError);
  }

  const status = aggregateStatus(outcomes.map((o) => o.status));
  await repo.markSocialPostPublished(ctx.db, postId, status);

  const news = outcomes.find(
    (o) => o.platform === 'site_news' && o.status === 'sent'
  );

  return {
    kind: 'published',
    body: { dryRun: false, postId, status, targets: outcomes },
    revalidate: news ? newsRevalidatePaths(news.permalink) : [],
    audit: {
      entity_type: 'social_post',
      entity_id: postId,
      payload: {
        status,
        targets: outcomes.map((o) => ({
          platform: o.platform,
          status: o.status,
          permalink: o.permalink,
          error: o.error,
        })),
      },
    },
  };
}
