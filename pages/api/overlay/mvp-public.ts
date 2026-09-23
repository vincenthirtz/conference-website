// GET (PUBLIC) /api/overlay/mvp-public
//
// Ce que la source OBS « coup de cœur du public » (`/overlay/mvp-public`) lit :
// le scrutin en cours, ses candidates, et les décomptes des DEUX plateformes —
// chat Twitch et supporters Discord — en UN appel.
//
// AUCUN PARAMÈTRE DE MATCH, ET C'EST LE POINT. La source rend le scrutin
// OUVERT du moment. Pendant un direct on ne recolle pas une URL dans OBS entre
// deux matchs : l'overlay se colle une fois pour la soirée et suit la régie
// tout seul. Même principe que la boîte d'alertes.
//
// LE CALCUL VIT DANS `utils/overlay/publicMvpFeed.ts`, parce que la route des
// alertes le sert AUSSI (`?with=mvp`), pour la source fusionnée
// `/overlay/regie`. Cette route-ci reste pour les régies qui préfèrent une
// source par élément — mais empiler quatre sources coûte quatre fois le tour
// du réseau, en boucle, pendant six heures.
//
// DES AGRÉGATS, JAMAIS UNE VOIX. `voter_key` ne sort d'aucune API, et surtout
// pas de celle-ci : c'est la seule route du scrutin qui soit PUBLIQUE, donc
// lisible par quiconque devine l'URL.

import type { NextApiRequest, NextApiResponse } from 'next';

import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';
import { resolveEmbedTenantId } from '@/utils/embed';
import { capabilityDenial } from '@/utils/billing/tenantCapabilityGate';
import {
  readPublicMvpFeed,
  type OverlayPublicMvpPoll,
} from '@/utils/overlay/publicMvpFeed';

export type {
  OverlayPublicMvpCandidate,
  OverlayPublicMvpPoll,
} from '@/utils/overlay/publicMvpFeed';

export type OverlayPublicMvpResponse = {
  /** `null` quand aucun scrutin n'est à l'écran : la source n'affiche rien. */
  poll: OverlayPublicMvpPoll | null;
  serverTime: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  // La source poll toutes les 10 s pendant des heures : la borne est large,
  // elle n'est là que contre un scraping.
  if (applyRateLimit(req, res, { max: 120, windowMs: 60_000 }, 'overlay-mvp')) {
    return;
  }

  try {
    const tenantId = await resolveEmbedTenantId(req.query);
    const denial = await capabilityDenial(
      tenantId,
      'matchOverlays',
      'Les sources de stream font partie de l’offre Régie.'
    );
    if (denial) return res.status(402).json(denial);

    const nowMs = Date.now();
    const poll = await readPublicMvpFeed(tenantId, nowMs);

    // Aligné sur la cadence des sources (10 s) : deux sources ouvertes sur
    // le même poste ne doivent pas doubler les requêtes.
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=10, stale-while-revalidate=30'
    );
    res.setHeader('X-Robots-Tag', 'noindex');

    return res.status(200).json({
      poll,
      serverTime: new Date(nowMs).toISOString(),
    } satisfies OverlayPublicMvpResponse);
  } catch (err) {
    logger.error('[overlay/mvp-public] unexpected', err);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
}
