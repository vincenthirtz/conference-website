import { describe, it, expect } from 'vitest';

import { SceneBuilder } from '@/utils/maps/builder';
import { generateScene, layoutForMapType } from '@/utils/maps/generate';
import { renderIsoSvg } from '@/utils/maps/isoSvg';
import { createRng, hashSeed } from '@/utils/maps/rng';
import { mapSlug } from '@/utils/maps/slug';
import { LANDMARK_KINDS, MAP_LAYOUTS, type MapRecipe } from '@/utils/maps/types';
import { buildLandmark } from '@/utils/maps/landmarks';
import { buildLayout } from '@/utils/maps/layouts';
import { deriveRecipe, getMapRecipe, hasAuthoredRecipe } from '@/config/maps';
import { OVERWATCH_RECIPES } from '@/config/maps/overwatch';
import { getGame, GAME_SLUGS } from '@/config/games';

const BASE: MapRecipe = {
  slug: 'test-map',
  name: 'Test Map',
  layout: 'control',
  palette: ['#112233', '#445566', '#778899', '#aabbcc'],
  landmarks: ['tower'],
};

describe('mapSlug', () => {
  // Ces valeurs sont celles des URLs d'images déjà en place dans
  // config/games/overwatch.ts : la bascule vers les maquettes locales ne doit
  // casser aucun chemin.
  it.each([
    ["King's Row", 'kings-row'],
    ['Watchpoint: Gibraltar', 'watchpoint-gibraltar'],
    ['Paraíso', 'paraiso'],
    ['Esperança', 'esperanca'],
    ['Route 66', 'route-66'],
    ['Lijiang Tower', 'lijiang-tower'],
  ])('%s -> %s', (name, slug) => {
    expect(mapSlug(name)).toBe(slug);
  });

  it('est idempotent', () => {
    expect(mapSlug(mapSlug("King's Row"))).toBe('kings-row');
  });
});

describe('rng', () => {
  it('même graine, même suite', () => {
    const a = createRng('ilios');
    const b = createRng('ilios');
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it('graines différentes, suites différentes', () => {
    expect(createRng('ilios').next()).not.toBe(createRng('busan').next());
  });

  it('int reste dans les bornes', () => {
    const rng = createRng('bornes');
    for (let i = 0; i < 500; i += 1) {
      const v = rng.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });

  it('hashSeed est stable et non signé', () => {
    expect(hashSeed('ilios')).toBe(hashSeed('ilios'));
    expect(hashSeed('ilios')).toBeGreaterThanOrEqual(0);
  });
});

describe('SceneBuilder', () => {
  it('déduplique une case posée deux fois', () => {
    const b = new SceneBuilder();
    b.place(0, 0, 0, 'ground');
    b.place(0, 0, 0, 'accent');
    expect(b.size).toBe(1);
    expect(b.toBricks()[0].role).toBe('ground');
  });

  it('keepExisting:false écrase la case', () => {
    const b = new SceneBuilder();
    b.place(0, 0, 0, 'ground');
    b.place(0, 0, 0, 'accent', { keepExisting: false });
    expect(b.toBricks()[0].role).toBe('accent');
  });

  it('ignore les hauteurs négatives', () => {
    const b = new SceneBuilder();
    b.place(0, -1, 0, 'ground');
    expect(b.size).toBe(0);
  });

  it('columnTop renvoie la première case libre', () => {
    const b = new SceneBuilder();
    b.box(0, 0, 0, 1, 4, 1, 'ground');
    expect(b.columnTop(0, 0)).toBe(4);
    expect(b.columnTop(9, 9)).toBe(0);
  });

  it('carve retire une brique', () => {
    const b = new SceneBuilder();
    b.box(0, 0, 0, 3, 3, 3, 'ground');
    b.carveBox(1, 1, 1, 1, 1, 1);
    expect(b.has(1, 1, 1)).toBe(false);
    expect(b.size).toBe(26);
  });

  it('underpin comble sous une colonne au sol mais pas sous un débord', () => {
    const b = new SceneBuilder();
    const mark = b.mark();
    b.place(0, 5, 0, 'structure'); // pied posé au niveau du sol (baseY = 5)
    b.place(3, 9, 0, 'structure'); // débord en l'air, 4 crans au-dessus
    b.underpin(mark, 5, 'ground');
    expect(b.has(0, 0, 0)).toBe(true);
    expect(b.has(0, 4, 0)).toBe(true);
    expect(b.has(3, 8, 0)).toBe(false);
    expect(b.has(3, 0, 0)).toBe(false);
  });

  it("underpin s'arrête sur la première case occupée", () => {
    const b = new SceneBuilder();
    b.place(0, 1, 0, 'accent');
    const mark = b.mark();
    b.place(0, 3, 0, 'structure');
    b.underpin(mark, 3, 'ground');
    expect(b.has(0, 2, 0)).toBe(true);
    expect(b.has(0, 0, 0)).toBe(false); // bloqué par la brique en y=1
  });
});

describe('layoutForMapType', () => {
  it.each([
    ['control', 'control'],
    ['escort', 'escort'],
    ['payload', 'escort'],
    ['koth', 'control'],
    ['CONTROL', 'control'],
    ['active-duty', 'standard'],
    ['', 'standard'],
    [null, 'standard'],
    ['type-inconnu', 'standard'],
  ])('%s -> %s', (input, expected) => {
    expect(layoutForMapType(input)).toBe(expected);
  });
});

describe('buildLayout', () => {
  it.each(MAP_LAYOUTS)('%s produit un terrain et trois ancres', (layout) => {
    const b = new SceneBuilder();
    const { anchors } = buildLayout({ ...BASE, layout }, b, createRng(layout));
    expect(b.size).toBeGreaterThan(200);
    expect(anchors).toHaveLength(3);
    for (const a of anchors) {
      expect(Number.isFinite(a.x)).toBe(true);
      expect(Number.isFinite(a.z)).toBe(true);
    }
  });

  it('push est symétrique en x', () => {
    const b = new SceneBuilder();
    buildLayout({ ...BASE, layout: 'push' }, b, createRng('push'));
    // La voie centrale doit exister des deux côtés du marqueur.
    expect(b.has(-10, 3, 0)).toBe(true);
    expect(b.has(10, 3, 0)).toBe(true);
  });
});

describe('buildLandmark', () => {
  it.each(LANDMARK_KINDS)('%s pose des briques sans lever', (kind) => {
    const b = new SceneBuilder();
    b.box(-16, 0, -16, 33, 3, 33, 'ground');
    const before = b.size;
    buildLandmark(kind, b, 0, 0, 3, createRng(kind));
    expect(b.size).not.toBe(before);
  });
});

describe('generateScene', () => {
  it('est déterministe pour une même recette', () => {
    const a = generateScene(OVERWATCH_RECIPES[0]);
    const c = generateScene(OVERWATCH_RECIPES[0]);
    expect(a.bricks).toEqual(c.bricks);
  });

  it('deux recettes différentes donnent des scènes différentes', () => {
    const a = generateScene(OVERWATCH_RECIPES[0]);
    const c = generateScene(OVERWATCH_RECIPES[1]);
    expect(a.bricks.length).not.toBe(c.bricks.length);
  });

  it('les bornes encadrent réellement les briques', () => {
    const scene = generateScene(OVERWATCH_RECIPES[2]);
    for (const brick of scene.bricks) {
      expect(brick.x).toBeGreaterThanOrEqual(scene.bounds.minX);
      expect(brick.x).toBeLessThanOrEqual(scene.bounds.maxX);
      expect(brick.y).toBeGreaterThanOrEqual(scene.bounds.minY);
      expect(brick.y).toBeLessThanOrEqual(scene.bounds.maxY);
      expect(brick.z).toBeGreaterThanOrEqual(scene.bounds.minZ);
      expect(brick.z).toBeLessThanOrEqual(scene.bounds.maxZ);
    }
  });

  it('toutes les coordonnées sont des entiers positifs en hauteur', () => {
    for (const recipe of OVERWATCH_RECIPES) {
      for (const brick of generateScene(recipe).bricks) {
        expect(Number.isInteger(brick.x)).toBe(true);
        expect(Number.isInteger(brick.y)).toBe(true);
        expect(Number.isInteger(brick.z)).toBe(true);
        expect(brick.y).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("n'émet une nappe d'environnement que si la recette en déclare une", () => {
    const withEnv = generateScene({
      ...BASE,
      environment: { kind: 'sea', color: '#123456' },
    });
    const withoutEnv = generateScene(BASE);
    expect(withEnv.bricks.some((b) => b.role === 'environment')).toBe(true);
    expect(withoutEnv.bricks.some((b) => b.role === 'environment')).toBe(false);
  });

  it('la nappe ne recouvre jamais le terrain', () => {
    const scene = generateScene({
      ...BASE,
      environment: { kind: 'sea', color: '#123456' },
    });
    const ground = new Set(
      scene.bricks.filter((b) => b.role === 'ground').map((b) => `${b.x},${b.z}`),
    );
    for (const brick of scene.bricks) {
      if (brick.role !== 'environment') continue;
      expect(ground.has(`${brick.x},${brick.z}`)).toBe(false);
    }
  });
});

describe('renderIsoSvg', () => {
  const scene = generateScene(OVERWATCH_RECIPES[1]);

  it('produit un SVG bien formé', () => {
    const svg = renderIsoSvg(scene);
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).not.toContain('NaN');
    expect(svg).not.toContain('undefined');
  });

  it('respecte le ratio demandé', () => {
    const svg = renderIsoSvg(scene, { aspect: 2 });
    const vb = /viewBox="(-?\d+) (-?\d+) (\d+) (\d+)"/.exec(svg);
    expect(vb).not.toBeNull();
    const w = Number(vb![3]);
    const h = Number(vb![4]);
    expect(w / h).toBeCloseTo(2, 1);
  });

  it('masque les faces des briques enterrées', () => {
    const buried = new SceneBuilder();
    buried.box(0, 0, 0, 3, 3, 3, 'ground');
    const svg = renderIsoSvg({
      recipe: BASE,
      bricks: buried.toBricks(),
      bounds: { minX: 0, maxX: 2, minY: 0, maxY: 2, minZ: 0, maxZ: 2 },
    });
    // Le cube central (1,1,1) est entouré : il ne doit produire aucune face.
    // 27 briques, mais bien moins de 27 faces du dessus.
    const tops = svg.match(/href="#t"/g)?.length ?? 0;
    expect(tops).toBeLessThan(9);
  });

  it('échappe le titre', () => {
    const svg = renderIsoSvg(scene, { title: '<script>alert("x")</script>' });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&#60;');
  });

  it('mode décoratif : aria-hidden et pas de <title>', () => {
    const svg = renderIsoSvg(scene, { decorative: true });
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).not.toContain('<title>');
  });

  it('mode accessible : role img et libellé', () => {
    const svg = renderIsoSvg(scene);
    expect(svg).toContain('role="img"');
    expect(svg).toContain('<title>Ilios</title>');
  });

  it('sans tenons, aucune instance du losange', () => {
    expect(renderIsoSvg(scene, { studs: false })).not.toContain('href="#s"');
  });

  it('rend une scène vide sans lever', () => {
    const svg = renderIsoSvg({
      recipe: BASE,
      bricks: [],
      bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
    });
    expect(svg).toContain('<svg ');
    expect(svg).not.toContain('NaN');
  });
});

describe('registre de recettes', () => {
  it('les slugs du lot pilote sont cohérents avec leur nom', () => {
    for (const recipe of OVERWATCH_RECIPES) {
      expect(recipe.slug).toBe(mapSlug(recipe.name));
    }
  });

  it('les slugs du lot pilote sont uniques', () => {
    const slugs = OVERWATCH_RECIPES.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('toute couleur de palette est un hex valide', () => {
    for (const recipe of OVERWATCH_RECIPES) {
      for (const color of recipe.palette) expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      if (recipe.environment) expect(recipe.environment.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('les silhouettes déclarées existent toutes', () => {
    for (const recipe of OVERWATCH_RECIPES) {
      for (const kind of recipe.landmarks) expect(LANDMARK_KINDS).toContain(kind);
    }
  });

  it('getMapRecipe retrouve la recette écrite à la main, quelle que soit la casse', () => {
    expect(getMapRecipe('overwatch', "king's row").slug).toBe('kings-row');
    expect(hasAuthoredRecipe('overwatch', "King's Row")).toBe(true);
  });

  it('getMapRecipe dérive une recette pour une map inconnue', () => {
    const recipe = getMapRecipe('overwatch', 'Une Map Inventée', 'control');
    expect(recipe.slug).toBe('une-map-inventee');
    expect(recipe.layout).toBe('control');
    expect(hasAuthoredRecipe('overwatch', 'Une Map Inventée')).toBe(false);
  });

  it('deriveRecipe est déterministe', () => {
    expect(deriveRecipe('Numbani', 'hybrid')).toEqual(deriveRecipe('Numbani', 'hybrid'));
  });

  it('deriveRecipe distingue deux maps de même type', () => {
    const a = deriveRecipe('Numbani', 'hybrid');
    const b = deriveRecipe('Hollywood', 'hybrid');
    expect(a.palette).not.toEqual(b.palette);
  });

  it('chaque map de chaque jeu du registre produit une maquette rendable', () => {
    for (const slug of GAME_SLUGS) {
      const game = getGame(slug);
      if (!game) continue;
      for (const map of game.mapPool) {
        const recipe = getMapRecipe(slug, map.name, map.type);
        const scene = generateScene(recipe);
        expect(scene.bricks.length).toBeGreaterThan(200);
      }
    }
  });
});
