// Régénère les sprites de la Women's Library : télécharge les sources, rend
// chaque meuble, le décor (sols, murs) et chaque avatar dans Blender, puis
// écrit manifest.json, CREDITS.md et catalog-draft.json.
//
//   node tools/library-assets/build.mjs                       # tout
//   node tools/library-assets/build.mjs --kind furniture      # meubles seuls
//   node tools/library-assets/build.mjs --kind decor          # sols et murs
//   node tools/library-assets/build.mjs --only a03            # un avatar
//   node tools/library-assets/build.mjs --only bookshelf_filled,globe
//   node tools/library-assets/build.mjs --kind furniture --missing   # reprise
//   node tools/library-assets/build.mjs --kind none           # index seuls
//
// Blender : variable BLENDER, sinon la version la plus récente trouvée dans
// « C:\Program Files\Blender Foundation », sinon « blender » dans le PATH.
// Un rendu partiel garde les sections du manifeste qu'il ne touche pas.
//
// ÉCRITURE PAR FUSION : le manifeste est relu sur disque juste avant chaque
// écriture, et seules les entrées rendues par CE build y sont remplacées. Deux
// builds lancés en parallèle (meubles d'un côté, décor ou avatars de l'autre)
// ne s'écrasent donc pas : chacun ne réécrit que ce qu'il a rendu.
//
// `--missing` saute un meuble déjà au manifeste dont les 4 images existent :
// un long build interrompu reprend là où il s'est arrêté.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  CACHE_DIR,
  fetchAvatarBase,
  fetchHdri,
  fetchModel,
  fetchTexture,
  readSources,
} from './fetch.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT_DIR = path.join(ROOT, 'public', 'library', 'spike');
const URL_PREFIX = '/library/spike';
const SPEC_DIR = path.join(CACHE_DIR, 'specs');
const CATALOG_DRAFT = path.join(HERE, 'catalog-draft.json');
// Doit rester identique à iso_common.py et au moteur.
const TILE = { width: 64, height: 32, meters: 0.5 };
const PIXEL_RATIO = 2;
// Les sprites d'un meuble sont toujours `<base><clé>_r<r>.webp` : le manifeste
// compact ne répète pas l'URL (voir engine/assets.ts, `parseManifest`).
const FURNITURE_BASE = `${URL_PREFIX}/furniture/`;

/**
 * Entrée COMPACTE d'un meuble (format du lot 11) :
 *   { f: [w, d], h: hauteur m, l?: calque, r: [[largeur, hauteur, ax, ay] × 4] }
 * Une entrée verbeuse (format du lot 3) dont les URL suivent la règle est
 * convertie ; une autre est gardée telle quelle (le moteur lit les deux).
 */
function compactEntry(key, e) {
  if (!e || Array.isArray(e.r)) return e;
  const r = (e.rotations ?? []).map((rot, i) =>
    rot.src === `${FURNITURE_BASE}${key}_r${i}.webp`
      ? [rot.width, rot.height, rot.anchor.x, rot.anchor.y]
      : null
  );
  if (r.length !== 4 || r.some((x) => x === null)) return e;
  return {
    f: [e.footprint.w, e.footprint.d],
    h: e.height,
    ...(e.layer ? { l: e.layer } : {}),
    r,
  };
}

/** Empreinte, hauteur, calque et fichiers d'une entrée (compacte ou non). */
function entryInfo(key, e) {
  if (Array.isArray(e.r))
    return {
      footprint: { w: e.f[0], d: e.f[1] },
      height: e.h,
      layer: e.l,
      files: e.r.map((_, i) => `${key}_r${i}.webp`),
    };
  return {
    footprint: e.footprint,
    height: e.height,
    layer: e.layer,
    files: e.rotations.map((r) => path.posix.basename(r.src)),
  };
}

/**
 * Le manifeste en texte : indenté, sauf les meubles, une ligne par clé (triées)
 * — compact pour le réseau, lisible en diff.
 */
function manifestText(m) {
  const { furniture, ...rest } = m;
  const head = JSON.stringify({ ...rest, furniture: '@@FURNITURE@@' }, null, 2);
  const keys = Object.keys(furniture).sort();
  const body = keys.length
    ? `{\n${keys.map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(furniture[k])}`).join(',\n')}\n  }`
    : '{}';
  return `${head.replace('"@@FURNITURE@@"', body)}\n`;
}

function findBlender() {
  if (process.env.BLENDER) return process.env.BLENDER;
  const base = 'C:\\Program Files\\Blender Foundation';
  if (existsSync(base)) {
    const versions = readdirSync(base)
      .filter((name) => /^Blender \d/.test(name))
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    for (const name of versions.reverse()) {
      const exe = path.join(base, name, 'blender.exe');
      if (existsSync(exe)) return exe;
    }
  }
  return 'blender';
}

// Lance un script Blender sans interface, sans scripts embarqués, et vérifie
// la ligne de succès qu'il imprime en dernier.
function runBlender(blender, script, args, okToken) {
  const run = spawnSync(
    blender,
    [
      '-b',
      '--factory-startup',
      '--disable-autoexec',
      '-P',
      path.join(HERE, script),
      '--',
      ...args,
    ],
    { encoding: 'utf8', cwd: HERE, maxBuffer: 64 * 1024 * 1024 }
  );
  const log = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  if (run.status !== 0 || !log.includes(okToken)) {
    console.error(log.split('\n').slice(-40).join('\n'));
    throw new Error(`${script} en échec (code ${run.status})`);
  }
  for (const line of log.split('\n')) {
    if (/^LIBRARY_(ASSET_OK|AVATAR_OK|DECOR|FILL|RECOLOR|REPACK)/.test(line))
      console.log(line);
  }
}

// Une ligne par source, avec tous ses usages.
function creditsMarkdown(credits) {
  const byUrl = new Map();
  for (const c of credits) {
    const hit = byUrl.get(c.url);
    if (hit) hit.usages.add(c.usage);
    else byUrl.set(c.url, { ...c, usages: new Set([c.usage]) });
  }
  const lines = [
    '# Crédits — sprites de la Women’s Library',
    '',
    'Sprites rendus par `tools/library-assets` à partir de modèles 3D et de',
    'textures. Toutes les sources ci-dessous sont sous licence CC0 1.0 : aucune',
    'attribution n’est exigée, on la donne quand même. La licence de Poly Haven',
    'est revérifiée à chaque build (https://polyhaven.com/license).',
    '',
  ];
  for (const c of byUrl.values()) {
    const name = c.url ? `[${c.name}](${c.url})` : c.name;
    lines.push(
      `- ${name}, ${c.authors.join(', ')} (${c.license}) — ${[...c.usages].join(', ')}`
    );
  }
  return `${lines.join('\n')}\n`;
}

const { values } = parseArgs({
  options: {
    // Une clé de meuble, de sol, de style de mur ou un identifiant d'avatar.
    only: { type: 'string' },
    // « furniture », « decor », « avatars » ou tout (par défaut).
    kind: { type: 'string', default: 'all' },
    samples: { type: 'string', default: '96' },
    'decor-samples': { type: 'string', default: '128' },
    'avatar-samples': { type: 'string', default: '48' },
    quality: { type: 'string' },
    // Reprise : saute les meubles déjà rendus (manifeste + 4 images).
    missing: { type: 'boolean', default: false },
  },
});
const only = values.only ? new Set(values.only.split(',')) : null;
const wants = (kind, id) =>
  (values.kind === 'all' || values.kind === kind) && (!only || only.has(id));

const sources = await readSources();
const blender = findBlender();
const furnitureDir = path.join(OUT_DIR, 'furniture');
const avatarDir = path.join(OUT_DIR, 'avatars');
const decorDir = path.join(OUT_DIR, 'decor');
for (const dir of [furnitureDir, avatarDir, decorDir, SPEC_DIR])
  await mkdir(dir, { recursive: true });

const hdri = await fetchHdri(sources.hdri);
const credits = [{ usage: 'éclairage', ...hdri.credit }];
const manifestPath = path.join(OUT_DIR, 'manifest.json');

/**
 * Le manifeste sur disque, ou `{}`. Un manifeste rendu avec un autre contrat
 * de case ne se complète pas : on repart de zéro, sinon il mélangerait deux
 * échelles.
 */
async function readDiskManifest() {
  try {
    const m = JSON.parse(await readFile(manifestPath, 'utf8'));
    return JSON.stringify(m.tile) === JSON.stringify(TILE) ? m : {};
  } catch {
    return {};
  }
}

const previous = await readDiskManifest();
const furniture = {};
for (const [k, v] of Object.entries(previous.furniture ?? {}))
  furniture[k] = compactEntry(k, v);
const avatars = { ...(previous.avatars ?? {}) };
const decor = {
  floors: { ...(previous.decor?.floors ?? {}) },
  walls: { ...(previous.decor?.walls ?? {}) },
};
// Ce que CE build a rendu (ou retiré) : seules ces entrées sont réécrites.
const touched = {
  furniture: new Set(),
  furnitureRemoved: new Set(),
  floors: new Set(),
  walls: new Set(),
  avatars: new Set(),
};

// Le manifeste est réécrit après chaque rendu : un long build interrompu garde
// ce qui est déjà fait. Il est relu juste avant : un build parallèle (décor,
// avatars) garde ses propres entrées, et ses sections inconnues d'ici aussi.
async function saveManifest() {
  const disk = await readDiskManifest();
  const outFurniture = {};
  for (const [k, v] of Object.entries(disk.furniture ?? {}))
    outFurniture[k] = compactEntry(k, v);
  for (const k of touched.furnitureRemoved) delete outFurniture[k];
  for (const k of touched.furniture) outFurniture[k] = furniture[k];
  const outDecor = {
    ...(disk.decor ?? {}),
    floors: { ...(disk.decor?.floors ?? {}) },
    walls: { ...(disk.decor?.walls ?? {}) },
  };
  for (const k of touched.floors) outDecor.floors[k] = decor.floors[k];
  for (const k of touched.walls) outDecor.walls[k] = decor.walls[k];
  const outAvatars = { ...(disk.avatars ?? {}) };
  for (const k of touched.avatars) outAvatars[k] = avatars[k];
  const manifest = {
    ...disk,
    version: 1,
    tile: TILE,
    pixelRatio: PIXEL_RATIO,
    furnitureBase: FURNITURE_BASE,
    furniture: outFurniture,
    decor: outDecor,
    avatars: outAvatars,
  };
  await writeFile(manifestPath, manifestText(manifest));
  await writeFile(path.join(OUT_DIR, 'CREDITS.md'), creditsMarkdown(credits));
  await writeCatalogDraft(outFurniture);
}

/**
 * Entrée de manifeste d'un avatar empaqueté (meta de iso_pack.py) : chaque
 * `file` (feuille de l'avatar, et feuille propre d'une animation comme `sit`)
 * devient une URL `sheet`.
 */
function avatarEntry(meta) {
  const { file, id: _id, animations, ...rest } = meta;
  const url = (f) => `${URL_PREFIX}/avatars/${f}`;
  const anims = {};
  for (const [name, a] of Object.entries(animations)) {
    const { file: own, ...r } = a;
    anims[name] = own ? { sheet: url(own), ...r } : r;
  }
  return { sheet: url(file), ...rest, animations: anims };
}

async function readMeta(dir, id) {
  const metaPath = path.join(dir, `${id}.json`);
  const meta = JSON.parse(await readFile(metaPath, 'utf8'));
  await rm(metaPath);
  return meta;
}

// --- Sources : modèles et textures (téléchargés une fois par build) --------

const modelCache = new Map();
const textureCache = new Map();
const asModelRef = (ref) =>
  typeof ref === 'string'
    ? { provider: 'polyhaven', id: ref, resolution: '1k' }
    : ref;

async function model(ref, usage) {
  const r = asModelRef(ref);
  const k = `${r.provider}:${r.id}:${r.resolution}`;
  if (!modelCache.has(k)) modelCache.set(k, await fetchModel(r));
  const m = modelCache.get(k);
  credits.push({ usage, ...m.credit });
  return m.path;
}

async function texture(id, usage) {
  if (!Object.hasOwn(sources.textures ?? {}, id))
    throw new Error(`texture absente de sources.json : ${id}`);
  if (!textureCache.has(id))
    textureCache.set(id, await fetchTexture(sources.textures[id]));
  const t = textureCache.get(id);
  credits.push({ usage, ...t.credit });
  return t.maps;
}

async function resolveTextures(slots, usage) {
  const out = {};
  for (const [slot, id] of Object.entries(slots ?? {}))
    out[slot] = await texture(id, usage);
  return out;
}

async function resolveFill(fill, usage) {
  if (!fill) return undefined;
  return { ...fill, gltf: await model(fill.books, usage) };
}

async function resolvePart(part, usage) {
  const out = { ...part };
  delete out.model;
  if (part.model) out.gltf = await model(part.model, usage);
  if (part.books)
    out.books = { ...part.books, gltf: await model(part.books.model, usage) };
  if (part.fill) out.fill = await resolveFill(part.fill, usage);
  return out;
}

// Fait maison (générateurs d'iso_build.py et d'iso_furniture.py) : CC0 par
// construction, rien n'est téléchargé.
const IN_HOUSE_CREDIT = {
  name: 'Fait maison, généré par tools/library-assets (iso_build.py, iso_furniture.py)',
  authors: ['Women’s Library'],
  url: null,
  license: 'CC0 1.0',
};

/**
 * Les meubles de sources.json et de sources-furniture.json, variantes
 * dépliées. Une variante (`variantOf`) reprend la source de sa base et n'en
 * change que ce qu'elle déclare (`recolor`, `tint`, paramètres de `generate`,
 * graine de garnissage…) ; sa famille est la clé de la base.
 */
function expandFurniture(all) {
  const out = {};
  for (const [key, s] of Object.entries(all)) {
    if (!s.variantOf) {
      out[key] = { ...s, family: s.family ?? key };
      continue;
    }
    const base = all[s.variantOf];
    if (!base) throw new Error(`${key} : variantOf inconnu (${s.variantOf})`);
    if (base.variantOf) throw new Error(`${key} : variante d'une variante`);
    const { variantOf, ...over } = s;
    const merged = { ...base, ...over, family: variantOf };
    for (const f of ['generate', 'catalog', 'fill'])
      if (base[f] && over[f]) merged[f] = { ...base[f], ...over[f] };
    out[key] = merged;
  }
  return out;
}
const furnitureSources = expandFurniture(sources.furniture);

/** Spec Blender d'un meuble (chemins résolus) et glTF principal éventuel. */
async function resolveFurniture(key, source) {
  const spec = {};
  let gltf = null;
  if (source.generate) spec.generate = source.generate;
  else if (source.books)
    spec.books = {
      ...source.books,
      gltf: await model(source.books.model, key),
    };
  else gltf = await model(source, key);
  if (source.generate || source.books)
    credits.push({ usage: key, ...IN_HOUSE_CREDIT });
  for (const field of ['rotate', 'scale', 'mount', 'tint', 'recolor'])
    if (source[field] !== undefined) spec[field] = source[field];
  spec.textures = await resolveTextures(source.textures, key);
  if (source.fill) spec.fill = await resolveFill(source.fill, key);
  if (source.parts) {
    spec.parts = [];
    for (const part of source.parts)
      spec.parts.push(await resolvePart(part, key));
  }
  return { gltf, spec };
}

// --- Brouillon du catalogue de l'API ---------------------------------------

async function writeCatalogDraft(rendered) {
  const out = {};
  for (const [key, source] of Object.entries(furnitureSources)) {
    const c = source.catalog;
    if (!rendered[key] || !c) continue;
    const info = entryInfo(key, rendered[key]);
    out[key] = {
      category: c.category,
      family: source.family,
      footprint: info.footprint,
      heightM: info.height,
      sittable: Boolean(c.sittable),
      stackable: Boolean(c.stackable),
      suggestedPrice: c.price,
      ...(info.layer ? { layer: info.layer } : {}),
    };
  }
  const draft = {
    note: 'Généré par tools/library-assets/build.mjs depuis le manifeste rendu et sources.json. À reporter dans config/library/furniture.ts (conference-api).',
    tile: TILE,
    furniture: out,
  };
  await writeFile(CATALOG_DRAFT, `${JSON.stringify(draft, null, 2)}\n`);
}

// --- Meubles ---------------------------------------------------------------

// Un meuble en échec n'arrête pas le build : il garde son entrée précédente
// et le build se termine en erreur, avec la liste.
const failures = [];
/** Déjà rendu : au manifeste (disque ou mémoire) et ses 4 images présentes. */
async function alreadyRendered(key) {
  const disk = await readDiskManifest();
  const entry = disk.furniture?.[key] ?? furniture[key];
  if (!entry) return false;
  return entryInfo(key, compactEntry(key, entry)).files.every((f) =>
    existsSync(path.join(furnitureDir, f))
  );
}
for (const [key, source] of Object.entries(furnitureSources)) {
  // Une source illisible (taille servie ≠ taille annoncée, modèle retiré…)
  // compte comme un échec de ce meuble, sans arrêter les autres.
  let resolved;
  try {
    resolved = await resolveFurniture(key, source);
  } catch (err) {
    console.error(`  ${key} : ${err.message}`);
    failures.push(key);
    continue;
  }
  const { gltf, spec } = resolved;
  if (!wants('furniture', key)) continue;
  if (values.missing && (await alreadyRendered(key))) continue;
  const specPath = path.join(SPEC_DIR, `${key}.json`);
  await writeFile(specPath, JSON.stringify(spec));
  const started = Date.now();
  try {
    runBlender(
      blender,
      'render_furniture.py',
      [
        ...(gltf ? ['--gltf', gltf] : []),
        '--hdri',
        hdri.path,
        '--key',
        key,
        '--out',
        furnitureDir,
        '--spec',
        specPath,
        '--samples',
        values.samples,
        ...(values.quality ? ['--quality', values.quality] : []),
      ],
      `LIBRARY_ASSET_OK ${key}`
    );
  } catch (err) {
    console.error(`  ${key} : ${err.message}`);
    failures.push(key);
    continue;
  }
  const meta = await readMeta(furnitureDir, key);
  furniture[key] = compactEntry(key, {
    footprint: meta.footprint,
    height: meta.height,
    ...(source.layer ? { layer: source.layer } : {}),
    rotations: meta.rotations.map(({ file, ...rest }) => ({
      src: `${URL_PREFIX}/furniture/${file}`,
      ...rest,
    })),
  });
  touched.furniture.add(key);
  await saveManifest();
  console.log(`  ${key} en ${Math.round((Date.now() - started) / 1000)} s`);
}

// Un meuble retiré des sources sort du manifeste (rendu complet et sans
// échec seulement).
if (
  !values.only &&
  !failures.length &&
  (values.kind === 'all' || values.kind === 'furniture')
) {
  const disk = await readDiskManifest();
  const current = { ...furniture, ...(disk.furniture ?? {}) };
  for (const key of Object.keys(current))
    if (!Object.hasOwn(furnitureSources, key)) {
      delete furniture[key];
      delete current[key];
      touched.furniture.delete(key);
      touched.furnitureRemoved.add(key);
    }
  await saveManifest();
  const used = new Set(
    Object.entries(current).flatMap(
      ([key, f]) => entryInfo(key, compactEntry(key, f)).files
    )
  );
  for (const file of readdirSync(furnitureDir))
    if (file.endsWith('.webp') && !used.has(file))
      await rm(path.join(furnitureDir, file));
}

// --- Décor : sols et murs --------------------------------------------------

const decorSources = sources.decor ?? { floors: {}, walls: {} };
const decorSpec = { floors: {}, walls: {} };
for (const [key, floor] of Object.entries(decorSources.floors ?? {})) {
  const maps = await texture(floor.texture, `sol ${key}`);
  if (wants('decor', key) || wants('decor', `floor_${key}`))
    decorSpec.floors[key] = { ...floor, maps };
}
for (const [key, style] of Object.entries(decorSources.walls ?? {})) {
  const textures = await resolveTextures(style.textures, `murs ${key}`);
  const books = style.books ? await model(style.books, `murs ${key}`) : null;
  if (wants('decor', key)) decorSpec.walls[key] = { ...style, textures, books };
}
if (
  Object.keys(decorSpec.floors).length ||
  Object.keys(decorSpec.walls).length
) {
  const specPath = path.join(SPEC_DIR, 'decor.json');
  await writeFile(specPath, JSON.stringify(decorSpec));
  const started = Date.now();
  runBlender(
    blender,
    'render_decor.py',
    [
      '--hdri',
      hdri.path,
      '--spec',
      specPath,
      '--out',
      decorDir,
      '--samples',
      values['decor-samples'],
      ...(values.quality ? ['--quality', values.quality] : []),
    ],
    'LIBRARY_DECOR_OK'
  );
  const meta = await readMeta(decorDir, 'decor');
  const src = (file) => `${URL_PREFIX}/decor/${file}`;
  for (const [key, f] of Object.entries(meta.floors)) {
    const { file, ...rest } = f;
    decor.floors[key] = { src: src(file), ...rest };
    touched.floors.add(key);
  }
  for (const [key, w] of Object.entries(meta.walls)) {
    const sides = {};
    for (const side of ['left', 'right']) {
      sides[side] = {};
      for (const [variant, v] of Object.entries(w[side])) {
        const { file, ...rest } = v;
        sides[side][variant] = { src: src(file), ...rest };
      }
    }
    decor.walls[key] = {
      height: w.height,
      thickness: w.thickness,
      ...sides,
    };
    touched.walls.add(key);
  }
  await saveManifest();
  console.log(`  décor en ${Math.round((Date.now() - started) / 1000)} s`);
}

// --- Avatars ---------------------------------------------------------------

const base = await fetchAvatarBase(sources.avatarBase);
credits.push({ usage: 'corps des avatars', ...base.credit });
for (const spec of sources.avatars) {
  if (!wants('avatars', spec.id)) continue;
  const started = Date.now();
  runBlender(
    blender,
    'render_avatar.py',
    [
      '--bundle',
      base.path,
      '--hdri',
      hdri.path,
      '--spec',
      JSON.stringify(spec),
      '--out',
      avatarDir,
      '--samples',
      values['avatar-samples'],
    ],
    `LIBRARY_AVATAR_OK ${spec.id}`
  );
  const meta = await readMeta(avatarDir, spec.id);
  avatars[meta.id] = avatarEntry(meta);
  touched.avatars.add(meta.id);
  await saveManifest();
  console.log(`  ${meta.id} en ${Math.round((Date.now() - started) / 1000)} s`);
}

// --- Conversion des anciennes grilles d'avatars (sans nouveau rendu) --------
//   node tools/library-assets/build.mjs --kind avatars-repack [--only a03]
// Les entrées encore en grille (format 1 : frameWidth, rowStart…) sont
// découpées et empaquetées (iso_pack.py) ; les feuilles sont remplacées sur
// place. Une entrée déjà empaquetée est laissée telle quelle.

if (values.kind === 'avatars-repack') {
  const jobs = Object.entries(avatars)
    .filter(([id, a]) => a.frameWidth && (!only || only.has(id)))
    .map(([id, a]) => ({
      ...a,
      id,
      path: path.join(OUT_DIR, 'avatars', path.posix.basename(a.sheet)),
    }));
  if (jobs.length) {
    const jobsPath = path.join(SPEC_DIR, 'avatars-repack.json');
    await writeFile(jobsPath, JSON.stringify(jobs));
    runBlender(
      blender,
      'repack_avatars.py',
      [
        '--jobs',
        jobsPath,
        '--out',
        avatarDir,
        ...(values.quality ? ['--quality', values.quality] : []),
      ],
      'LIBRARY_REPACK_OK'
    );
    for (const job of jobs) {
      avatars[job.id] = avatarEntry(await readMeta(avatarDir, job.id));
      touched.avatars.add(job.id);
    }
    await saveManifest();
  }
  console.log(`avatars convertis : ${jobs.length}`);
}

await saveManifest();
console.log(`manifeste écrit : ${manifestPath}`);
if (failures.length) {
  console.error(`en échec : ${failures.join(', ')}`);
  process.exitCode = 1;
}
