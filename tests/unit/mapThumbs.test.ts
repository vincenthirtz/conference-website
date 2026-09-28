// Miniatures des maquettes de maps — scripts/render-map-thumbs.mjs
//
// La vue TCG staff affiche les maps par leur MINIATURE WebP (`thumbUrl`), pas
// par le SVG voxel (trop coûteux à dessiner à trente). Une map ajoutée au
// registre sans `npm run maps:thumbs` s'afficherait en case vide : ce test le
// dit avant la mise en ligne.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { MAP_POOL_SLUGS, mapFace } from '../../utils/tcg/readMapFaces';

const PUBLIC = join(__dirname, '..', '..', 'public');

describe('miniatures des maps', () => {
  it('chaque map du vivier a sa maquette ET sa miniature', () => {
    const missing = MAP_POOL_SLUGS.flatMap((slug) => {
      const face = mapFace(slug);
      return [face.imageUrl, face.thumbUrl]
        .filter((url): url is string => Boolean(url))
        .filter((url) => !existsSync(join(PUBLIC, url)))
        .concat(face.thumbUrl ? [] : [`${slug}: thumbUrl absent`]);
    });
    expect(
      missing,
      'Lancez `npm run maps:render` puis `npm run maps:thumbs`.'
    ).toEqual([]);
  });

  it('une map inconnue n’a ni maquette ni miniature', () => {
    expect(mapFace('nexiste-pas')).toMatchObject({
      imageUrl: null,
      thumbUrl: null,
    });
  });
});
