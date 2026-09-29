// features/player/tcg/service/showcase.ts — ma vitrine (lot P14, extrait de
// pages/api/player/tcg/showcase.ts, même contrat).
//
// OPT-IN : sans réglage, rien n'est montré. ON NE PEUT EXPOSER QUE CE QU'ON
// POSSÈDE, vérifié deux fois : à l'enregistrement (`409 not_owned`) et à
// chaque affichage (la vitrine se relit contre la possession réelle). Seules
// des RÉFÉRENCES de sujet sont stockées.
//
// La régénération de la fiche publique (`revalidatePlayerCard`) est HTTP :
// elle vit dans la route, entre l'écriture et la relecture.

import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import {
  MAX_SHOWCASE_CARDS,
  parseShowcaseKey,
  readShowcaseRow,
  resolveShowcaseCards,
  showcaseKey,
  type ShowcaseSubject,
} from '@/utils/tcg/showcase';
import * as repo from '../repository/core';
import { ShowcaseBody } from '../schemas';
import { parseOrRefuse, refuse } from './errors';
import type { TcgServiceContext } from './context';

/** L'état de ma vitrine, cartes relues contre ma possession. */
export async function readShowcase(ctx: TcgServiceContext) {
  const { tenantId, userId, logger } = ctx;
  const row = await readShowcaseRow(tenantId, userId);
  if (!row.ok) {
    logger.error('[tcg/showcase] vitrine illisible: %s', row.error);
    throw refuse(500, 'Lecture impossible.');
  }
  const enabled = row.row?.enabled ?? false;
  const stored = row.row?.subjectKeys ?? [];

  const resolved = await resolveShowcaseCards(tenantId, userId, stored);
  if (!resolved.ok) {
    logger.error('[tcg/showcase] collection illisible: %s', resolved.error);
    throw refuse(500, 'Lecture impossible.');
  }

  return {
    enabled,
    cards: resolved.cards,
    unavailable: resolved.unavailable,
    maxCards: MAX_SHOWCASE_CARDS,
    publicProfileUrl: await publicProfileUrl(ctx),
  };
}

/** Enregistre le réglage ; la route régénère la fiche puis relit. */
export async function saveShowcase(ctx: TcgServiceContext, rawBody: unknown) {
  const { db, tenantId, userId, logger } = ctx;
  const body = parseOrRefuse(ShowcaseBody, rawBody, {
    message: 'Réglage invalide.',
    code: 'invalid_body',
  });
  const subjects = body.cards.map(parseShowcaseKey);
  if (subjects.some((s) => s === null)) {
    throw refuse(400, 'Carte invalide.', 'invalid_card');
  }
  const keys = [...new Set((subjects as ShowcaseSubject[]).map(showcaseKey))];

  if (body.enabled && keys.length > 0) {
    const resolved = await resolveShowcaseCards(tenantId, userId, keys);
    if (!resolved.ok) {
      logger.error('[tcg/showcase] collection illisible: %s', resolved.error);
      throw refuse(500, 'Lecture impossible.');
    }
    if (resolved.unavailable > 0) {
      throw refuse(409, 'Carte non possédée.', 'not_owned');
    }
  }

  const { error } = await repo.upsertShowcaseSettings(db, {
    tenantId,
    userId,
    enabled: body.enabled,
    keys,
  });
  if (error) {
    logger.error('[tcg/showcase] réglage non écrit: %s', error.message);
    throw refuse(500, 'Enregistrement impossible.');
  }
}

/**
 * L'URL de la fiche publique où la vitrine s'affiche, ou `null` si elle
 * n'existe pas (joueuse ni classée ni sur un roster, ou autre espace que
 * celui par défaut) : l'écran dit alors qu'elle ne s'affiche nulle part.
 */
async function publicProfileUrl(ctx: TcgServiceContext) {
  if (ctx.tenantId !== DEFAULT_TENANT_ID) return null;
  return (await repo.hasPublicPlayerPage(ctx.db, ctx))
    ? `/player/${ctx.userId}`
    : null;
}
