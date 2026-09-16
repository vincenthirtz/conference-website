// pages/api/og/match/[matchId]/story.tsx
//
// L'affiche d'un match au format STORY (1080×1920), pour Instagram, TikTok ou
// une story Twitch. Une carte panoramique postée en story se retrouve minuscule
// entre deux bandes vides ; une équipe qui annonce son match n'ouvrira pas un
// éditeur d'image pour la recadrer.
//
// Chemin dédié plutôt que `?format=story` : le CDN ne fait pas varier son cache
// sur la query (cf. utils/og/matchPoster).

import type { NextApiRequest, NextApiResponse } from 'next';
import { renderMatchPoster } from '@/utils/og/matchPoster';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  return renderMatchPoster(req, res, true);
}
