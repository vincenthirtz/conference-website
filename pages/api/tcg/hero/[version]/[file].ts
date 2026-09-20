// pages/api/tcg/hero/[version]/[file].ts
//
// GET (PUBLIC) — la figurine voxel d'un héros :
//   /api/tcg/hero/v1/reinhardt.svg
//
// Même politique que les figurines de rôle (`/api/tcg/figure/...`) : rendu à la
// volée, tout dans le CHEMIN et rien dans la query — le cache CDN de Netlify ne
// distingue pas deux variantes d'une même URL par leurs paramètres. La sortie
// ne dépendant que du chemin, elle se met en cache un an ; la version (`v1`)
// est dans l'URL pour qu'une retouche des modèles se propage sans attendre
// l'expiration.
//
// PAS DE COULEUR D'ÉQUIPE ICI, contrairement aux figurines de rôle. Un héros a
// SES couleurs — un Reinhardt rose ne serait plus Reinhardt, et c'est justement
// la couleur dominante qui le fait reconnaître à cette taille. Le chemin ne
// porte donc que le slug.

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  HERO_FIGURE_VERSION,
  isHeroFigureSlug,
  renderHeroFigureSvg,
} from '@/utils/tcg/heroFigures';

const FILE_RE = /^([a-z0-9]+)\.svg$/;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Une ancienne version n'est plus servie : lui rendre le modèle courant
  // mettrait en cache, pour un an et sous l'ancienne URL, un dessin qui n'est
  // pas le sien.
  if (first(req.query.version) !== `v${HERO_FIGURE_VERSION}`) {
    return res.status(404).json({ error: 'Figurine introuvable.' });
  }

  const match = FILE_RE.exec(first(req.query.file));
  const slug = match?.[1] ?? '';
  if (!isHeroFigureSlug(slug)) {
    return res.status(404).json({ error: 'Figurine introuvable.' });
  }

  const svg = renderHeroFigureSvg(slug);

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  // Un SVG servi seul pourrait porter du script si quelqu'un l'ouvrait
  // directement : on n'en sert jamais, et l'en-tête l'interdit de toute façon.
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(200).send(svg);
}
