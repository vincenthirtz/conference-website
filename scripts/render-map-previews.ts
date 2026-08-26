// scripts/render-map-previews.ts
// Pré-rend les maquettes voxel du map pool en SVG isométriques statiques.
//
// USAGE:
//   npm run maps:render            # toutes les recettes écrites à la main
//   npm run maps:render -- --all   # + une maquette dérivée pour chaque map du registre
//
// Sortie : public/img/maps/<jeu>/<slug>.svg (assets servis) + une planche-contact
// map-previews.html a la racine (outil de dev, hors public/, ignoree par git).
//
// NODE >= 22.6 requis : le script importe directement les modules TypeScript et
// s'appuie sur le type-stripping natif de Node (cf. la même contrainte que la
// suite vitest, qui tourne en node 24). Les imports sont donc RELATIFS — pas
// d'alias `@/`, que Node ne sait pas résoudre.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateScene } from '../utils/maps/generate.ts';
import { renderIsoSvg } from '../utils/maps/isoSvg.ts';
import { mapSlug } from '../utils/maps/slug.ts';
import type { MapRecipe } from '../utils/maps/types.ts';
import { OVERWATCH_RECIPES } from '../config/maps/overwatch.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_ROOT = join(ROOT, 'public', 'img', 'maps');

const AUTHORED: { game: string; recipes: MapRecipe[] }[] = [
  { game: 'overwatch', recipes: OVERWATCH_RECIPES },
];

type Rendered = { game: string; recipe: MapRecipe; svg: string; bricks: number; bytes: number };

function render(game: string, recipe: MapRecipe): Rendered {
  const scene = generateScene(recipe);
  const svg = renderIsoSvg(scene, { tile: 16, cubeHeight: 10 });
  const dir = join(OUT_ROOT, game);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${recipe.slug}.svg`), svg);
  return { game, recipe, svg, bricks: scene.bricks.length, bytes: Buffer.byteLength(svg) };
}

function contactSheet(items: Rendered[]): string {
  const cards = items
    .map(
      (it) =>
        `<figure><div class="frame">${it.svg}</div>` +
        `<figcaption><b>${it.recipe.name}</b><br>${it.recipe.layout} · ${it.recipe.mood ?? 'day'} · ` +
        `${it.bricks} briques · ${(it.bytes / 1024).toFixed(0)} ko</figcaption></figure>`,
    )
    .join('');
  return (
    `<!doctype html><meta charset="utf-8"><title>Maquettes voxel — map pool</title>` +
    `<style>body{background:#0d0f14;color:#e8e8ef;font:14px/1.5 system-ui;margin:0;padding:28px}` +
    `h1{font-size:18px;margin:0 0 20px}` +
    `.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:22px}` +
    `figure{margin:0}.frame{aspect-ratio:16/10;overflow:hidden;border-radius:12px;background:#000;display:flex}` +
    `.frame svg{width:100%;height:100%;object-fit:cover}` +
    `figcaption{padding-top:8px;opacity:.65;font-size:12px}</style>` +
    `<h1>Maquettes voxel — ${items.length} maps</h1><div class="grid">${cards}</div>`
  );
}

const all = process.argv.includes('--all');
const rendered: Rendered[] = [];

for (const { game, recipes } of AUTHORED) {
  for (const recipe of recipes) rendered.push(render(game, recipe));
}

if (all) {
  // Les maps sans recette écrite : maquette dérivée, pour vérifier que le repli
  // ne produit jamais de trou visuel dans le map pool.
  const { getGame, GAME_SLUGS } = await import('../config/games/index.ts');
  const { deriveRecipe } = await import('../config/maps/index.ts');
  for (const slug of GAME_SLUGS) {
    const game = getGame(slug);
    if (!game) continue;
    for (const map of game.mapPool) {
      if (rendered.some((r) => r.game === slug && r.recipe.slug === mapSlug(map.name))) continue;
      rendered.push(render(slug, deriveRecipe(map.name, map.type)));
    }
  }
}

mkdirSync(OUT_ROOT, { recursive: true });
writeFileSync(join(ROOT, 'map-previews.html'), contactSheet(rendered));

const total = rendered.reduce((n, r) => n + r.bytes, 0);
console.log(
  `${rendered.length} maquettes -> public/img/maps/ (${(total / 1024).toFixed(0)} ko, ` +
    `moyenne ${(total / rendered.length / 1024).toFixed(1)} ko)`,
);
console.log('planche-contact : map-previews.html');
