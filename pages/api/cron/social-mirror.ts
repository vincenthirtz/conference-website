// pages/api/cron/social-mirror.ts
//
// Recopie ce que l'association publie ailleurs — posts Bluesky, vidéos
// YouTube, publications Instagram et vidéos TikTok — vers DEUX destinations :
// le salon Discord, et le mur « nos réseaux » du site.
//
// LES DEUX N'ONT PAS LES MÊMES RÈGLES. Discord ne reçoit que ce qui est
// postérieur au curseur, sinon activer un miroir y déverserait tout
// l'historique d'un coup ; le site enregistre TOUT ce que le flux a rendu,
// sinon son mur resterait vide pendant des semaines. Une seule lecture des
// flux sert les deux — c'est tout l'intérêt de les traiter ici.
//
// ET ELLES SONT INDÉPENDANTES. Pas de salon configuré ne veut pas dire pas de
// mur : le site continue d'être alimenté, seule l'émission vers Discord est
// sautée. L'inverse vaut aussi — une écriture en base en échec ne prive pas le
// salon de son miroir.
//
// Un passage, par source : lire le flux public → garder ce qui est postérieur
// au curseur → émettre un event `social.mirror` par publication → avancer le
// curseur.
//
// LE CURSEUR N'AVANCE QUE SUR CE QUI EST RÉELLEMENT ÉMIS. Si l'émission échoue
// à la troisième publication sur cinq, le curseur reste à la deuxième et le
// passage suivant reprend là — plutôt que d'avancer d'office et de perdre trois
// publications en silence.
//
// UNE SOURCE EN PANNE N'ARRÊTE PAS LES AUTRES. YouTube injoignable, ou un
// jeton Instagram périmé, ne doit pas empêcher les posts Bluesky d'arriver :
// chaque source est traitée dans son propre try, et le rapport dit laquelle a
// échoué.
//
// Auth : Bearer CRON_SECRET (header) ou ?secret=... — comme les autres crons.

import type { NextApiRequest, NextApiResponse } from 'next';
import { emitBotEvent } from '@/utils/botEvents';
import { getIntegrationSecret } from '@/utils/integrationSecrets';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import {
  buildMirrorMessage,
  readChannelId,
  readCursor,
  readSetting,
  selectNew,
  writeCursor,
  type MirrorPost,
  type MirrorSource,
} from '@/utils/social/feedMirror';
import { fetchAuthorFeed } from '@/utils/social/blueskyMirror';
import {
  fetchChannelVideos,
  YOUTUBE_CHANNEL_KEY,
} from '@/utils/social/youtubeMirror';
import { readInstagramForMirror } from '@/utils/social/instagramMirror';
import { fetchOwnVideos } from '@/utils/social/tiktokMirror';
import { persistFeedItems } from '@/utils/social/socialFeed';

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[cron/social-mirror] CRON_SECRET absent — refus');
    return false;
  }
  if (req.headers.authorization === `Bearer ${secret}`) return true;
  const q = req.query.secret;
  return typeof q === 'string' && q === secret;
}

type SourceReport = {
  mirrored: number;
  checked: number;
  /** Nouveautés écrites pour le mur du site. */
  stored?: number;
  error?: string;
};

/**
 * Émet les publications nouvelles d'une source et avance son curseur.
 *
 * `prefix` distingue les sources dans le salon : sans lui, un titre de vidéo et
 * un post se ressemblent une fois le lien replié en aperçu.
 *
 * `fetchPosts` peut rendre `null` pour dire « source pas configurée » — un
 * compte Instagram jamais connecté, par exemple. Ce n'est pas une panne, et ça
 * ne doit pas remplir le journal d'erreurs toutes les quinze minutes.
 */
async function mirrorSource(
  tenantId: string,
  source: MirrorSource,
  /** `null` = miroir Discord non configuré : on alimente le site, sans plus. */
  channelId: string | null,
  fetchPosts: () => Promise<MirrorPost[] | null>,
  prefix: string
): Promise<SourceReport> {
  let posts: MirrorPost[] | null;
  try {
    posts = await fetchPosts();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[cron/social-mirror] %s injoignable: %s', source, message);
    return { mirrored: 0, checked: 0, error: message };
  }
  if (posts === null)
    return { mirrored: 0, checked: 0, error: 'not_configured' };

  // AVANT le curseur, et avant toute sortie anticipée : le mur du site veut
  // l'historique récent, pas seulement les nouveautés du quart d'heure.
  // `persistFeedItems` ne lève jamais — le mur est un bonus, son échec ne doit
  // pas priver Discord de son miroir.
  const stored = await persistFeedItems(tenantId, source, posts);
  if (!channelId) return { mirrored: 0, checked: posts.length, stored };

  const since = await readCursor(tenantId, source);
  const fresh = selectNew(posts, since);
  if (fresh.length === 0) return { mirrored: 0, checked: posts.length, stored };

  let mirrored = 0;
  let lastAt: string | null = null;

  for (const post of fresh) {
    try {
      await emitBotEvent(
        'social.mirror',
        {
          source,
          channelId,
          content: buildMirrorMessage(post, prefix),
          url: post.url,
          postedAt: post.publishedAt,
        },
        tenantId
      );
      mirrored += 1;
      lastAt = post.publishedAt;
    } catch (err) {
      logger.error(
        '[cron/social-mirror] %s émission échouée pour %s: %s',
        source,
        post.id,
        err instanceof Error ? err.message : String(err)
      );
      // On s'arrête au premier échec : avancer le curseur au-delà perdrait les
      // publications suivantes, et les émettre dans le désordre les afficherait
      // ainsi.
      break;
    }
  }

  if (lastAt) {
    try {
      await writeCursor(tenantId, source, lastAt);
    } catch (err) {
      // Curseur non écrit : le prochain passage réémettra. Un doublon dans un
      // salon est gênant, mais moins qu'un silence permanent — et cette
      // écriture ne rate que si la base est en panne.
      logger.error(
        '[cron/social-mirror] %s écriture du curseur échouée',
        source,
        err
      );
    }
  }

  return { mirrored, checked: posts.length, stored };
}

/** Tenants actifs à parcourir, ou le seul demandé via `?tenant=`. */
async function resolveTargetTenants(req: NextApiRequest): Promise<string[]> {
  const only = req.query.tenant;
  if (typeof only === 'string' && only) return [only];

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('is_active', true);
  if (error) {
    logger.error('[cron/social-mirror] tenants load error', error);
    return [];
  }
  return ((data ?? []) as Array<{ id: string }>).map((t) => t.id);
}

/**
 * Un passage de miroir pour UN tenant.
 *
 * Chaque espace a son salon d'actualités, ses comptes Bluesky et Instagram et
 * sa chaîne YouTube : le miroir n'a de sens que par tenant. Non configuré =
 * fonction en veille, pas panne.
 */
async function mirrorForTenant(
  tenantId: string
): Promise<Record<string, unknown>> {
  // Salon absent = miroir Discord non activé. Ce n'est PAS une raison de
  // s'arrêter : le mur « Nos réseaux » du site se remplit quand même, et il n'a
  // jamais eu besoin de Discord. Sortir ici, comme on le faisait quand le seul
  // client était le salon, laisserait le site désespérément vide.
  const channelId = await readChannelId(tenantId);

  // Le handle sert d'identité du compte à suivre. Il vient des identifiants de
  // publication, mais la LECTURE n'en a pas besoin.
  const handle = await getIntegrationSecret(tenantId, 'bluesky_handle');
  const bluesky: SourceReport = handle
    ? await mirrorSource(
        tenantId,
        'bluesky',
        channelId,
        () => fetchAuthorFeed(handle),
        ''
      )
    : { mirrored: 0, checked: 0, error: 'no_handle' };

  const youtubeChannel = await readSetting(tenantId, YOUTUBE_CHANNEL_KEY);
  const youtube: SourceReport = youtubeChannel
    ? await mirrorSource(
        tenantId,
        'youtube',
        channelId,
        () => fetchChannelVideos(youtubeChannel),
        '📺 Nouvelle vidéo —'
      )
    : { mirrored: 0, checked: 0, error: 'no_channel_id' };

  // Instagram ne sert aucun flux public : la lecture passe par le jeton du
  // compte connecté, et rend `null` quand il n'y en a pas. Son échec est
  // consigné sur le compte (social_accounts.last_error) : un warn dans les logs
  // de la fonction ne se voyait pas, et Instagram manquait au mur en silence.
  const instagram: SourceReport = await mirrorSource(
    tenantId,
    'instagram',
    channelId,
    () => readInstagramForMirror(tenantId),
    '📸 Instagram —'
  );

  // Même posture qu'Instagram : aucun flux public, donc lecture authentifiée,
  // et `null` quand le compte n'est pas connecté. Le jeton TikTok ne vivant que
  // 24 h, c'est ce passage-ci qui le rafraîchit au besoin — le cron quotidien
  // arriverait trop tard.
  const tiktok: SourceReport = await mirrorSource(
    tenantId,
    'tiktok',
    channelId,
    () => fetchOwnVideos(tenantId),
    '🎵 TikTok —'
  );

  return { tenantId, bluesky, youtube, instagram, tiktok };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const tenantIds = await resolveTargetTenants(req);
  const results: Array<Record<string, unknown>> = [];

  for (const tenantId of tenantIds) {
    try {
      results.push(await mirrorForTenant(tenantId));
    } catch (err) {
      logger.error('[cron/social-mirror] tenant=%s error:', tenantId, err);
      results.push({ tenantId, error: 'internal_error' });
    }
  }

  return res.status(200).json({ tenants: results.length, results });
}
