// pages/api/og/match/[matchId].tsx
//
// L'affiche d'un match au format CARTE (1200×630) : c'est l'`og:image` de la
// page du match, donc ce que montrent Discord, X ou Bluesky quand on partage
// le lien. Le format story vit à `/api/og/match/<uuid>/story` — une URL à
// part, parce que le CDN ne distingue pas deux variantes d'une même URL (cf.
// utils/og/matchPoster).

import type { NextApiRequest, NextApiResponse } from 'next';
import { renderMatchPoster } from '@/utils/og/matchPoster';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  return renderMatchPoster(req, res, false);
}
