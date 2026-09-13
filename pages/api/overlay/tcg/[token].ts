// pages/api/overlay/tcg/[token].ts
//
// GET (PUBLIC) : ce qu'une source navigateur OBS affiche du TCG en direct.
//
// PUBLIC PAR NÉCESSITÉ, BORNÉ PAR CONCEPTION. Une source navigateur ne peut pas
// se connecter : elle charge une URL. L'accès est donc porté par un JETON
// opaque et révocable (`tcg_overlay_tokens`) plutôt que par une session, et ce
// que la réponse contient est réduit au strict nécessaire — un pseudo Twitch
// (déjà public dans le chat) et une origine d'événement. Aucun nom de compte,
// aucune photo, aucun identifiant interne. La règle vit dans
// `utils/tcg/overlayFeed.ts`, qui est le seul chemin par lequel un nom sort.
//
// CONTRAT DE GENTILLESSE ENVERS OBS, calqué sur `/api/overlay/[runId]` : une
// source ajoutée avant le direct interroge dans le vide pendant des heures.
// Elle ne doit jamais recevoir d'erreur pour autant.
//   - jeton absent / malformé → 400, une seule fois, à la configuration ;
//   - jeton inconnu ou révoqué → 404 explicite (la régie doit le voir) ;
//   - rien à annoncer → 200 avec une liste vide.
//
// CACHE COURT. `s-maxage=5` comme l'overlay de régie : assez pour absorber une
// interrogation rapprochée, assez frais pour qu'un drop s'affiche tout de
// suite. Le jeton étant dans le chemin, deux tenants ne peuvent pas se
// partager une entrée de cache.

import type { NextApiRequest, NextApiResponse } from 'next';

import { applyRateLimit } from '@/utils/rateLimit';
import { resolveTenantFromOverlayToken } from '@/utils/tcg/overlayToken';
import {
  readTcgOverlayFeed,
  type OverlayFeedItem,
} from '@/utils/tcg/overlayFeed';
import { readOverlayTheme } from '@/utils/tcg/overlayTheme';
import type { OverlayTheme } from '@/utils/tcg/overlayThemeShape';
import { logger } from '@/utils/logger';

// L'habillage voyage AVEC les annonces plutôt que par une seconde route : cela
// éviterait un point d'entrée anonyme de plus, et la source interroge déjà
// celle-ci toutes les 5 secondes. Le thème est petit et se met en cache avec le
// reste.
//
// Il ne transite PAS par `overlayFeed.ts`, qui est la frontière de
// confidentialité : l'habillage ne porte aucune donnée personnelle, et l'y
// faire passer diluerait la seule raison d'être de ce module.
export type TcgOverlayPayload = {
  items: OverlayFeedItem[];
  theme: OverlayTheme;
};

type ApiResponse = TcgOverlayPayload | { error: string; code?: string };

/** Les jetons font 43 caractères base64url (32 octets). */
const TOKEN_RE = /^[A-Za-z0-9_-]{20,120}$/;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Généreux : une source OBS interroge en boucle pendant des heures, et la
  // borne réelle est le cache CDN devant cette route.
  if (applyRateLimit(req, res, { max: 120, windowMs: 60_000 }, 'tcg-overlay')) {
    return;
  }

  const raw = req.query.token;
  const token = typeof raw === 'string' ? raw : '';
  if (!TOKEN_RE.test(token)) {
    // Erreur de configuration, pas de direct : on la dit franchement.
    return res
      .status(400)
      .json({ error: 'Jeton invalide.', code: 'INVALID_TOKEN' });
  }

  let tenantId: string | null;
  try {
    tenantId = await resolveTenantFromOverlayToken(token);
  } catch (err) {
    logger.error('[tcg/overlay] résolution du jeton impossible', err);
    return res.status(503).json({ error: 'Indisponible.' });
  }

  if (!tenantId) {
    // Inconnu OU révoqué : la même réponse pour les deux. Distinguer
    // apprendrait à qui teste des jetons lesquels ont existé.
    return res
      .status(404)
      .json({ error: 'Overlay introuvable.', code: 'UNKNOWN_TOKEN' });
  }

  // En parallèle : deux lectures indépendantes, et l'overlay attend la plus
  // lente des deux plutôt que leur somme. Aucune des deux ne lève.
  const [items, theme] = await Promise.all([
    readTcgOverlayFeed(tenantId),
    readOverlayTheme(tenantId),
  ]);

  res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=30');
  // Une URL porteuse n'a rien à faire dans un index de moteur de recherche.
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(200).json({ items, theme });
}
