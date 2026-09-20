// pages/api/tcg/figure/[version]/[role]/[file].ts
//
// GET (PUBLIC) — la figurine voxel d'un rôle, dans une couleur d'équipe :
//   /api/tcg/figure/v1/tank/a62edb.svg
//
// Rendue à la volée par le moteur des maquettes (`utils/tcg/roleFigures.ts`) :
// un SVG de quelques dizaines de kilo-octets, calculé en quelques
// millisecondes, sans stockage. On ne pré-rend pas toutes les couleurs
// possibles — une équipe peut en choisir n'importe laquelle.
//
// TOUT EST DANS LE CHEMIN, rien dans la query : le cache CDN de Netlify ne
// distinguait pas deux variantes d'une même URL par leurs paramètres (cf.
// l'affiche de match, `/api/og/match/<uuid>/story`). La sortie ne dépendant que
// du chemin, elle se met en cache un an ; la version (`v1`) est dans l'URL pour
// qu'une retouche des modèles se propage sans attendre l'expiration.
//
// Ce qui entre dans le SVG est validé strictement : un rôle de la liste, une
// couleur `RRGGBB`. Rien d'autre ne traverse jusqu'au rendu.

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  FIGURE_ROLES,
  FIGURE_VERSION,
  normalizeFigureColor,
  renderRoleFigureSvg,
  type FigureRole,
} from '@/utils/tcg/roleFigures';
import {
  MASCOT_SLUG,
  MASCOT_VERSION,
  renderMascotSvg,
} from '@/utils/tcg/mascotFigure';

const FILE_RE = /^([0-9a-fA-F]{6})\.svg$/;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // La mascotte partage cette route : même politique de cache, même validation
  // stricte, une seule porte pour tout ce que le moteur voxel rend. Elle porte
  // SA PROPRE version : retoucher le nœud ne doit pas invalider le cache des
  // trois figurines de rôle, ni l'inverse.
  const version = first(req.query.version);
  const slug = first(req.query.role);
  const isMascot = slug === MASCOT_SLUG;

  const expected = isMascot ? `v${MASCOT_VERSION}` : `v${FIGURE_VERSION}`;
  // Une ancienne version n'est plus servie : lui rendre le modèle courant
  // mettrait en cache, pour un an et sous l'ancienne URL, un dessin qui n'est
  // pas le sien.
  if (version !== expected) {
    return res.status(404).json({ error: 'Figurine introuvable.' });
  }

  if (!isMascot && !(FIGURE_ROLES as readonly string[]).includes(slug)) {
    return res.status(404).json({ error: 'Figurine introuvable.' });
  }

  const match = FILE_RE.exec(first(req.query.file));
  const color = match ? normalizeFigureColor(match[1]) : null;
  if (!color) {
    return res
      .status(400)
      .json({ error: 'Couleur invalide (RRGGBB attendu).' });
  }

  const svg = isMascot
    ? renderMascotSvg(color)
    : renderRoleFigureSvg(slug as FigureRole, color);

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
