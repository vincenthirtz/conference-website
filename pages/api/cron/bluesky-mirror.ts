// pages/api/cron/bluesky-mirror.ts
//
// Recopie les nouveaux posts Bluesky de l'association dans un salon Discord.
//
// Un passage : lire le fil public → garder ce qui est postérieur au curseur →
// émettre un event `social.mirror` par post → avancer le curseur.
//
// LE CURSEUR N'AVANCE QUE SUR LES POSTS ÉMIS. Si l'émission échoue au troisième
// post sur cinq, le curseur reste au deuxième et le passage suivant reprend
// là — plutôt que d'avancer d'office et de perdre silencieusement trois posts.
//
// Auth : Bearer CRON_SECRET (header) ou ?secret=... — comme les autres crons.

import type { NextApiRequest, NextApiResponse } from 'next';
import { emitBotEvent } from '@/utils/botEvents';
import { getIntegrationSecret } from '@/utils/integrationSecrets';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { logger } from '@/utils/logger';
import {
  buildMirrorMessage,
  fetchAuthorFeed,
  readChannelId,
  readCursor,
  selectNew,
  writeCursor,
} from '@/utils/social/blueskyMirror';

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[cron/bluesky-mirror] CRON_SECRET absent — refus');
    return false;
  }
  if (req.headers.authorization === `Bearer ${secret}`) return true;
  const q = req.query.secret;
  return typeof q === 'string' && q === secret;
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

  const tenantId = DEFAULT_TENANT_ID;

  const channelId = await readChannelId(tenantId);
  if (!channelId) {
    // Miroir non configuré : ce n'est pas une panne, c'est une fonctionnalité
    // qu'on n'a pas activée.
    return res.status(200).json({ skipped: 'no_channel', mirrored: 0 });
  }

  // Le handle sert d'identité du compte à suivre. Il vient des identifiants de
  // publication, mais la LECTURE n'en a pas besoin : le miroir marche même si
  // le mot de passe d'application n'est pas posé.
  const handle =
    (await getIntegrationSecret(tenantId, 'bluesky_handle')) ??
    'womenscup.bsky.social';

  let posts;
  try {
    posts = await fetchAuthorFeed(handle);
  } catch (err) {
    logger.error('[cron/bluesky-mirror] lecture du fil échouée', err);
    return res.status(502).json({ error: 'Bluesky unreachable' });
  }

  const since = await readCursor(tenantId);
  const fresh = selectNew(posts, since);
  if (fresh.length === 0) {
    return res.status(200).json({ mirrored: 0, checked: posts.length });
  }

  let mirrored = 0;
  let lastAt: string | null = null;

  for (const post of fresh) {
    try {
      await emitBotEvent(
        'social.mirror',
        {
          source: 'bluesky',
          channelId,
          content: buildMirrorMessage(post),
          url: post.url,
          postedAt: post.createdAt,
        },
        tenantId
      );
      mirrored += 1;
      lastAt = post.createdAt;
    } catch (err) {
      logger.error(
        '[cron/bluesky-mirror] émission échouée pour %s: %s',
        post.uri,
        err instanceof Error ? err.message : String(err)
      );
      // On s'arrête au premier échec : avancer le curseur au-delà perdrait les
      // posts suivants, et les émettre dans le désordre les afficherait ainsi.
      break;
    }
  }

  if (lastAt) {
    try {
      await writeCursor(tenantId, lastAt);
    } catch (err) {
      // Curseur non écrit : le prochain passage réémettra ces posts. Un doublon
      // dans un salon est gênant, mais moins qu'un silence permanent — et cette
      // écriture ne rate que si la base est en panne.
      logger.error('[cron/bluesky-mirror] écriture du curseur échouée', err);
    }
  }

  return res.status(200).json({ mirrored, checked: posts.length });
}
