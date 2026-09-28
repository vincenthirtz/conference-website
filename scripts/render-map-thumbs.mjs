// scripts/render-map-thumbs.mjs
//
// Miniatures WebP des maquettes voxel de maps, pour les écrans qui en montrent
// beaucoup à la fois (vue TCG staff : 30 maps sur une page).
//
// POURQUOI. Les maquettes sont des SVG de 120 à 175 Ko, faits de milliers de
// polygones : parfaits en grand, coûteux quand trente se dessinent ensemble à
// 160 px de large. Une miniature raster pèse quelques Ko et ne coûte rien à
// peindre. Le SVG reste la source : les miniatures s'en DÉRIVENT.
//
// USAGE : npm run maps:thumbs   (après `npm run maps:render`)
// Sortie : public/img/maps/<jeu>/thumbs/<slug>.webp — versionnées.
// `tests/unit/mapThumbs.test.ts` échoue si une maquette n'a pas sa miniature.
//
// `sharp` arrive avec Next (dépendance optionnelle) : pas de dépendance ajoutée.

import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAPS = join(ROOT, 'public', 'img', 'maps');
/** 2× la largeur affichée (~160 px) : net sur écran haute densité. */
const WIDTH = 320;

let total = 0;
for (const game of readdirSync(MAPS)) {
  const dir = join(MAPS, game);
  if (!statSync(dir).isDirectory()) continue;
  const out = join(dir, 'thumbs');
  mkdirSync(out, { recursive: true });
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
    const slug = file.slice(0, -4);
    const svg = readFileSync(join(dir, file));
    const dest = join(out, `${slug}.webp`);
    // `density` haute : librsvg rastérise d'abord à grande taille, puis on
    // réduit — sinon les arêtes fines des briques bavent.
    const info = await sharp(svg, { density: 192 })
      .resize({ width: WIDTH, withoutEnlargement: false })
      .webp({ quality: 82, effort: 6 })
      .toFile(dest);
    total += info.size;
    console.log(`${game}/${slug}.webp  ${(info.size / 1024).toFixed(1)} Ko`);
  }
}
console.log(`Total : ${(total / 1024).toFixed(0)} Ko`);
