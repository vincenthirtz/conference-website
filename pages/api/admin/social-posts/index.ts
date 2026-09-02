// pages/api/admin/social-posts/index.ts
//
// Composer un post une fois et l'envoyer sur plusieurs destinations.
//
// GET  — le catalogue des destinations + l'historique des envois, avec le
//        statut et le permalien de CHAQUE cible. Alimente l'écran admin.
//        Query : ?limit=20
//
// POST — { text, imageUrl?, targets[], dryRun? }
//        `dryRun: true` (défaut) renvoie l'APERÇU rendu par destination, avec
//        les erreurs de validation, sans rien publier. `dryRun: false` publie,
//        écrit `social_posts` + `social_post_targets` et journalise l'action.
//
// Auth : session staff porteuse de `manage_communications` (withStaffRoute).
//
// L'idempotence n'est pas un confort ici. Un email parti deux fois est gênant ;
// une actualité publiée deux fois et une annonce postée deux fois se voient, et
// se suppriment à la main sur deux surfaces. D'où `withAdminIdempotency` : un
// double-clic, un retry navigateur ou une coupure réseau rejouent la réponse au
// lieu du travail.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { supabaseAdmin } from '@/utils/supabase';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import { SOCIAL_PLATFORMS, isSocialPlatformKey } from '@/utils/social/platforms';
import { loadAccount } from '@/utils/social/instagram';
import {
  aggregateStatus,
  newsRevalidatePaths,
  publishTargets,
  resolveTargets,
  type SocialTargetInput,
} from '@/utils/social/socialPosts';

const targetSchema = z.object({
  platform: z.string().refine(isSocialPlatformKey, {
    message: 'Destination inconnue.',
  }),
  textOverride: z.string().max(8000).nullable().optional(),
  imageOverride: z.string().url().max(2000).nullable().optional(),
  titleOverride: z.string().max(200).nullable().optional(),
});

const bodySchema = z.object({
  text: z.string().min(1).max(8000),
  imageUrl: z.string().url().max(2000).nullable().optional(),
  targets: z.array(targetSchema).min(1).max(SOCIAL_PLATFORMS.length),
  // Défaut PRUDENT : sans `dryRun: false` explicite, on ne fait qu'un aperçu.
  // Un client qui oublie le champ ne publie pas une annonce publique.
  dryRun: z.boolean().default(true),
});

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'social-posts' }),
  { permission: 'manage_communications' }
);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method === 'GET') return handleGet(req, res, ctx);
  if (req.method === 'POST') return handlePost(req, res, ctx);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

type ConnectionState = {
  connected: boolean;
  handle: string | null;
  expiresAt: string | null;
  status: string;
};

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service base de données indisponible.' });
  }
  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));

  const { data, error } = await supabaseAdmin
    .from('social_posts')
    .select(
      'id, base_text, base_image_url, status, published_at, created_at, ' +
        'targets:social_post_targets(platform, status, permalink, error, sent_at)'
    )
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('[admin/social-posts] list error', error);
    return res.status(500).json({ error: 'Chargement de l’historique impossible.' });
  }

  // État de connexion des cibles qui en exigent une. Le panneau s'en sert pour
  // afficher « à connecter » plutôt que de laisser cocher une case dont la
  // publication échouerait — et pour prévenir AVANT que le jeton expire.
  const connections: Record<string, ConnectionState> = {};
  for (const platform of SOCIAL_PLATFORMS) {
    if (!platform.needsConnection) continue;
    const account = await loadAccount(ctx.tenantId, platform.key);
    const expiresAt = account?.expiresAt ?? null;
    const expired = Boolean(expiresAt && expiresAt.getTime() < Date.now());
    connections[platform.key] = {
      connected: Boolean(account?.accessToken) && !expired,
      handle: account?.handle ?? null,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      status: expired ? 'expired' : (account?.status ?? 'disconnected'),
    };
  }

  return res.status(200).json({
    platforms: SOCIAL_PLATFORMS,
    connections,
    posts: data ?? [],
  });
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'social-posts')) {
    return;
  }

  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Requête invalide.',
      details: parsed.error.issues.map((i) => i.message),
    });
  }
  const input = parsed.data;

  // Deux cibles sur la même plateforme, ce sont deux messages identiques dans
  // le même salon. La contrainte UNIQUE en base le refuserait, mais un 500
  // Postgres est un mauvais message d'erreur.
  const seen = new Set<string>();
  for (const t of input.targets) {
    if (seen.has(t.platform)) {
      return res.status(400).json({
        error: `La destination ${t.platform} est présente deux fois.`,
      });
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
    return res.status(200).json({ dryRun: true, targets: preview });
  }

  // Une seule cible en erreur suffit à tout refuser : on ne publie pas la
  // moitié d'une annonce parce que le texte X était trop long. La relecture se
  // fait à l'aperçu, pas après coup sur un réseau public.
  const blocking = resolved.filter((t) => t.error);
  if (blocking.length > 0) {
    return res.status(400).json({
      error: 'Certaines destinations ne peuvent pas recevoir ce post.',
      targets: preview,
    });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service base de données indisponible.' });
  }

  const { data: post, error: postError } = await supabaseAdmin
    .from('social_posts')
    .insert({
      tenant_id: ctx.tenantId,
      base_text: input.text,
      base_image_url: input.imageUrl ?? null,
      status: 'publishing',
      created_by: ctx.staff?.id ?? null,
    })
    .select('id')
    .single();

  if (postError || !post) {
    logger.error('[admin/social-posts] create error', postError);
    return res.status(500).json({ error: 'Enregistrement du post impossible.' });
  }
  const postId = (post as { id: string }).id;

  const outcomes = await publishTargets(resolved, {
    tenantId: ctx.tenantId,
    staffId: ctx.staff?.id ?? null,
    postId,
  });

  const byPlatform = new Map(resolved.map((t) => [t.platform, t]));
  const { error: targetsError } = await supabaseAdmin
    .from('social_post_targets')
    .insert(
      outcomes.map((o) => {
        const t = byPlatform.get(o.platform);
        return {
          post_id: postId,
          platform: o.platform,
          text_override: t?.text ?? null,
          image_override: t?.imageUrl ?? null,
          title_override: t?.title ?? null,
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
    // Les publications ont eu lieu ; seule leur trace a échoué. On le dit
    // plutôt que de laisser croire à un échec d'envoi — un opérateur qui
    // recommencerait posterait une seconde fois.
    logger.error('[admin/social-posts] targets insert error', targetsError);
  }

  const status = aggregateStatus(outcomes.map((o) => o.status));
  await supabaseAdmin
    .from('social_posts')
    .update({
      status,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', postId);

  // ISR : l'actualité n'apparaît sur l'accueil et la liste qu'après
  // revalidation. Best-effort — une revalidation ratée se rattrape au prochain
  // build, elle ne doit pas faire échouer une publication déjà partie.
  const news = outcomes.find((o) => o.platform === 'site_news' && o.status === 'sent');
  if (news) {
    await Promise.all(
      newsRevalidatePaths(news.permalink).map((path) =>
        res.revalidate(path).catch((err) => {
          logger.error(`[admin/social-posts] revalidate ${path} failed`, err);
        })
      )
    );
  }

  if (ctx.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'publish_social_post',
        entity_type: 'social_post',
        entity_id: postId,
        tenant_id: ctx.tenantId,
        payload: {
          status,
          targets: outcomes.map((o) => ({
            platform: o.platform,
            status: o.status,
            permalink: o.permalink,
            error: o.error,
          })),
        },
      });
    } catch (logErr) {
      logger.error('logStaffAction(publish_social_post) error:', logErr);
    }
  }

  return res.status(201).json({
    dryRun: false,
    postId,
    status,
    targets: outcomes,
  });
}
