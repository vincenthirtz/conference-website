import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, it, expect } from 'vitest';

import { SceneBuilder } from '@/utils/maps/builder';
import { generateScene, layoutForMapType } from '@/utils/maps/generate';
import { renderIsoSvg } from '@/utils/maps/isoSvg';
import { createRng, hashSeed } from '@/utils/maps/rng';
import { mapSlug } from '@/utils/maps/slug';
import { LANDMARK_KINDS, MAP_LAYOUTS, type MapRecipe } from '@/utils/maps/types';
import { buildLandmark } from '@/utils/maps/landmarks';
import { buildLayout } from '@/utils/maps/layouts';
import { canDress, groundProp, railing, roofProps } from '@/utils/maps/props';
import { deriveRecipe, getMapRecipe, hasAuthoredRecipe } from '@/config/maps';
import { OVERWATCH_RECIPES } from '@/config/maps/overwatch';
import { getGame, GAME_SLUGS } from '@/config/games';

/** Les tests visent des recettes PAR SLUG : l'ordre du tableau n'est pas un contrat. */
const bySlug = (slug: string): MapRecipe => {
  const recipe = OVERWATCH_RECIPES.find((r) => r.slug === slug);
  if (!recipe) throw new Error(`recette introuvable : ${slug}`);
  return recipe;
};

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
    const a = generateScene(bySlug('kings-row'));
    const c = generateScene(bySlug('kings-row'));
    expect(a.bricks).toEqual(c.bricks);
  });

  it('deux recettes différentes donnent des scènes différentes', () => {
    const a = generateScene(bySlug('kings-row'));
    const c = generateScene(bySlug('ilios'));
    expect(a.bricks).not.toEqual(c.bricks);
  });

  it('les bornes encadrent réellement les briques', () => {
    const scene = generateScene(bySlug('junkertown'));
    const { minX, maxX, minY, maxY, minZ, maxZ } = scene.bounds;
    // Une assertion agrégée : 4 000 briques x 6 expect() feraient exploser le
    // temps du test pour la même information.
    const outside = scene.bricks.filter(
      (b) =>
        b.x < minX || b.x > maxX || b.y < minY || b.y > maxY || b.z < minZ || b.z > maxZ,
    );
    expect(outside).toEqual([]);
  });

  it('toutes les coordonnées sont des entiers, y jamais négatif', () => {
    const invalid = OVERWATCH_RECIPES.flatMap((recipe) =>
      generateScene(recipe).bricks.filter(
        (b) =>
          !Number.isInteger(b.x) || !Number.isInteger(b.y) || !Number.isInteger(b.z) || b.y < 0,
      ),
    );
    expect(invalid).toEqual([]);
  });

  // Régression : une balise d'objectif posée sur l'ancre d'une silhouette
  // faisait calculer l'altitude de pose au sommet de la balise. La silhouette
  // était montée d'une dizaine de crans puis sous-bassée, ce qui donnait des
  // pilotis absurdes. Le garde-fou vit dans anchorBase (generate.ts).
  it('aucune maquette ne part en pilotis (hauteur totale plausible)', () => {
    const tall = OVERWATCH_RECIPES.map((r) => ({
      slug: r.slug,
      maxY: generateScene(r).bounds.maxY,
    })).filter((r) => r.maxY > 34);
    expect(tall).toEqual([]);
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

describe('props', () => {
  it('canDress refuse une colonne dont le sommet est un objectif', () => {
    const b = new SceneBuilder();
    b.box(0, 0, 0, 1, 3, 1, 'ground');
    b.box(1, 0, 0, 1, 3, 1, 'highlight');
    expect(canDress(b, 0, 0, 3)).toBe(true);
    expect(canDress(b, 1, 0, 3)).toBe(false);
  });

  it('canDress refuse une colonne trop haute (un toit)', () => {
    const b = new SceneBuilder();
    b.box(0, 0, 0, 1, 6, 1, 'ground');
    expect(canDress(b, 0, 0, 3)).toBe(false);
  });

  it('groundProp pose quelque chose, jamais sous le niveau zéro', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const b = new SceneBuilder();
      b.box(-4, 0, -4, 9, 3, 9, 'ground');
      const before = b.size;
      groundProp(b, 0, 3, 0, createRng(`prop-${seed}`));
      expect(b.size).toBeGreaterThan(before);
      expect(b.toBricks().every((brick) => brick.y >= 0)).toBe(true);
    }
  });

  it('railing ne pose que le pourtour', () => {
    const b = new SceneBuilder();
    railing(b, 0, 0, 0, 5, 5);
    expect(b.has(2, 0, 2)).toBe(false); // centre laissé libre
    expect(b.has(0, 0, 0)).toBe(true);
  });

  it('roofProps ne fait rien sur une toiture trop petite', () => {
    const b = new SceneBuilder();
    roofProps(b, createRng('roof'), 'modern', 0, 5, 0, 2, 2);
    expect(b.size).toBe(0);
  });
});

describe('renderIsoSvg', () => {
  const scene = generateScene(bySlug('ilios'));

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

  it("namespace le dégradé de ciel — deux maquettes inlinées ne doivent pas partager d'id", () => {
    const other = generateScene(bySlug('kings-row'));
    const idOf = (svg: string) => /linearGradient id="([^"]+)"/.exec(svg)?.[1];
    expect(idOf(renderIsoSvg(scene))).toBeDefined();
    expect(idOf(renderIsoSvg(scene))).not.toBe(idOf(renderIsoSvg(other)));
  });

  it("l'id du ciel est stable pour une même maquette", () => {
    const idOf = (svg: string) => /linearGradient id="([^"]+)"/.exec(svg)?.[1];
    expect(idOf(renderIsoSvg(scene))).toBe(idOf(renderIsoSvg(scene)));
  });

  it('idPrefix namespace aussi les faces unitaires', () => {
    const svg = renderIsoSvg(scene, { idPrefix: 'ilios-' });
    expect(svg).toContain('<path id="ilios-t"');
    expect(svg).toContain('href="#ilios-t"');
    expect(svg).not.toContain('href="#t"');
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

  it('toutes les maps Overwatch du registre ont une recette écrite à la main', () => {
    const game = getGame('overwatch');
    expect(game).not.toBeNull();
    const missing = game!.mapPool
      .filter((m) => !hasAuthoredRecipe('overwatch', m.name))
      .map((m) => m.name);
    expect(missing).toEqual([]);
  });

  it("le lot Overwatch ne contient pas de recette orpheline (map retirée du pool)", () => {
    const pool = new Set(getGame('overwatch')!.mapPool.map((m) => mapSlug(m.name)));
    const orphans = OVERWATCH_RECIPES.filter((r) => !pool.has(r.slug)).map((r) => r.slug);
    expect(orphans).toEqual([]);
  });

  it('chaque mode de jeu Overwatch est couvert par au moins une recette', () => {
    const layouts = new Set(OVERWATCH_RECIPES.map((r) => r.layout));
    expect([...layouts].sort()).toEqual(['control', 'escort', 'flashpoint', 'hybrid', 'push']);
  });

  // Le catalogue Overwatch ne pointe plus vers un CDN tiers : les vignettes sont
  // nos propres maquettes, servies depuis public/. Une map ajoutée sans
  // `npm run maps:render` afficherait une image cassée en production — ces deux
  // tests sont le seul filet, `next build` ne vérifiant pas les chemins d'assets.
  it('chaque map Overwatch pointe vers le chemin de sa maquette locale', () => {
    const wrong = getGame('overwatch')!
      .mapPool.map((m) => ({ name: m.name, image: m.image }))
      .filter((m) => m.image !== `/img/maps/overwatch/${mapSlug(m.name)}.svg`);
    expect(wrong).toEqual([]);
  });

  it('le fichier de chaque vignette Overwatch existe sur le disque', () => {
    const missing = getGame('overwatch')!
      .mapPool.map((m) => m.image)
      .filter((image) => !existsSync(path.join(process.cwd(), 'public', image)));
    expect(missing).toEqual([]);
  });

  it('aucune vignette Overwatch ne dépend encore d\'un hôte externe', () => {
    const remote = getGame('overwatch')!
      .mapPool.map((m) => m.image)
      .filter((image) => /^https?:\/\//.test(image));
    expect(remote).toEqual([]);
  });

  // Exhaustif par construction : ~200 maps x une scène complète. Le délai par
  // défaut de vitest (5 s) suffit en isolation mais pas quand la suite entière
  // tourne en parallèle — d'où le délai explicite, préféré à un échantillonnage
  // qui ferait perdre à ce test tout son intérêt (c'est LA garantie que le repli
  // ne produit jamais de maquette vide, pour n'importe quelle map de n'importe
  // quel jeu).
  it(
    'chaque map de chaque jeu du registre produit une maquette rendable',
    () => {
      const empty: string[] = [];
      for (const slug of GAME_SLUGS) {
        const game = getGame(slug);
        if (!game) continue;
        for (const map of game.mapPool) {
          const scene = generateScene(getMapRecipe(slug, map.name, map.type));
          if (scene.bricks.length <= 200) empty.push(`${slug}/${map.name}`);
        }
      }
      expect(empty).toEqual([]);
    },
    60_000
  );
});
