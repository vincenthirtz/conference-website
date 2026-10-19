// Régénère les sprites de la Women's Library : télécharge les sources, rend
// chaque meuble, le décor (sols, murs) et chaque avatar dans Blender, puis
// écrit manifest.json, CREDITS.md et catalog-draft.json.
//
//   node tools/library-assets/build.mjs                       # tout
//   node tools/library-assets/build.mjs --kind furniture      # meubles seuls
//   node tools/library-assets/build.mjs --kind decor          # sols et murs
//   node tools/library-assets/build.mjs --only a03            # un avatar
//   node tools/library-assets/build.mjs --only bookshelf_filled,globe
//
// Blender : variable BLENDER, sinon la version la plus récente trouvée dans
// « C:\Program Files\Blender Foundation », sinon « blender » dans le PATH.
// Un rendu partiel garde les sections du manifeste qu'il ne touche pas.

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
    if (/^LIBRARY_(ASSET_OK|AVATAR_OK|DECOR|FILL|REPACK)/.test(line))
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
    'attribution n’est exigée, on la donne quand même.',
    '',
  ];
  for (const c of byUrl.values()) {
    lines.push(
      `- [${c.name}](${c.url}), ${c.authors.join(', ')} (${c.license}) — ${[...c.usages].join(', ')}`
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
const existing = existsSync(manifestPath)
  ? JSON.parse(await readFile(manifestPath, 'utf8'))
  : null;
// Un manifeste rendu avec un autre contrat de case ne se complète pas : on
// repart de zéro, sinon il mélangerait deux échelles.
const previous =
  existing && JSON.stringify(existing.tile) === JSON.stringify(TILE)
    ? existing
    : { furniture: {}, avatars: {} };
const furniture = { ...previous.furniture };
const avatars = { ...(previous.avatars ?? {}) };
const decor = {
  floors: { ...(previous.decor?.floors ?? {}) },
  walls: { ...(previous.decor?.walls ?? {}) },
};

// Le manifeste est réécrit après chaque rendu : un long build interrompu garde
// ce qui est déjà fait.
async function saveManifest() {
  const manifest = {
    version: 1,
    tile: TILE,
    pixelRatio: PIXEL_RATIO,
    furniture,
    decor,
    avatars,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(OUT_DIR, 'CREDITS.md'), creditsMarkdown(credits));
  await writeCatalogDraft();
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

/** Spec Blender d'un meuble (chemins résolus) et glTF principal éventuel. */
async function resolveFurniture(key, source) {
  const spec = {};
  let gltf = null;
  if (source.generate) spec.generate = source.generate;
  else gltf = await model(source, key);
  for (const field of ['rotate', 'scale', 'mount', 'tint'])
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

async function writeCatalogDraft() {
  const out = {};
  for (const [key, source] of Object.entries(sources.furniture)) {
    const rendered = furniture[key];
    const c = source.catalog;
    if (!rendered || !c) continue;
    out[key] = {
      category: c.category,
      footprint: rendered.footprint,
      heightM: rendered.height,
      sittable: Boolean(c.sittable),
      stackable: Boolean(c.stackable),
      suggestedPrice: c.price,
      ...(rendered.layer ? { layer: rendered.layer } : {}),
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
for (const [key, source] of Object.entries(sources.furniture)) {
  const { gltf, spec } = await resolveFurniture(key, source);
  if (!wants('furniture', key)) continue;
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
  furniture[key] = {
    footprint: meta.footprint,
    height: meta.height,
    ...(source.layer ? { layer: source.layer } : {}),
    rotations: meta.rotations.map(({ file, ...rest }) => ({
      src: `${URL_PREFIX}/furniture/${file}`,
      ...rest,
    })),
  };
  await saveManifest();
  console.log(`  ${key} en ${Math.round((Date.now() - started) / 1000)} s`);
}

// Un meuble retiré de sources.json sort du manifeste (rendu complet et sans
// échec seulement).
if (
  !values.only &&
  !failures.length &&
  (values.kind === 'all' || values.kind === 'furniture')
) {
  for (const key of Object.keys(furniture))
    if (!Object.hasOwn(sources.furniture, key)) delete furniture[key];
  const used = new Set(
    Object.values(furniture).flatMap((f) =>
      f.rotations.map((r) => path.posix.basename(r.src))
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
    for (const job of jobs)
      avatars[job.id] = avatarEntry(await readMeta(avatarDir, job.id));
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
