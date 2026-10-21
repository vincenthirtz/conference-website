// Rend les CALQUES de l'avatar personnalisable (lot 13 de
// docs/PLAN-womens-library.md) et écrit leur index, `layers.json`, à côté des
// feuilles : public/library/spike/avatars/layers/.
//
//   node tools/library-assets/render_layers.mjs                  # tout (reprend)
//   node tools/library-assets/render_layers.mjs --only hair.afro,top.coat
//   node tools/library-assets/render_layers.mjs --preview --only body.s3
//   node tools/library-assets/render_layers.mjs --index          # index seul
//   node tools/library-assets/render_layers.mjs --repack --quality 90  # recadrage serré
//   node tools/library-assets/render_layers.mjs --poses lie,sit_low    # poses ajoutées seules
//
// `--poses` ne rend que ces poses (lot 15b : `lie`, `sit_low`), chacune avec
// sa meta `<calque>@<pose>.json` et sa feuille `<calque>-<pose>.webp` ; la
// base (idle, walk, sit : `<calque>.json`) n'est ni relue ni réécrite.
// L'index fusionne la base et les poses ajoutées présentes.
//
// Les images sont recadrées SERRÉ sur leurs pixels : l'ancre au sol peut
// tomber hors du cadre (une coiffure ne s'étire pas jusqu'aux pieds).
//
// Le manifeste principal (build.mjs) n'est pas touché : l'index des calques
// est un fichier à part, chargé seulement quand un avatar composé est dessiné.
// Les metas par calque restent dans le cache (LIBRARY_ASSETS_CACHE) : un rendu
// interrompu reprend au premier calque manquant. UN seul Blender à la fois.
//
// Sources : le corps du bundle CC0 « Human Base Meshes » et la HDRI de
// sources.json, les mêmes que build.mjs — rien de nouveau pour CREDITS.md.

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  CACHE_DIR,
  fetchAvatarBase,
  fetchHdri,
  readSources,
} from './fetch.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT_DIR = path.join(
  ROOT,
  'public',
  'library',
  'spike',
  'avatars',
  'layers'
);
const URL_PREFIX = '/library/spike/avatars/layers';
const META_DIR = path.join(CACHE_DIR, 'avatar-layers');
const SPEC_PATH = path.join(CACHE_DIR, 'specs', 'avatar-layers.json');
// Doit rester identique à iso_common.py, build.mjs et au moteur.
const TILE = { width: 64, height: 32, meters: 0.5 };
const PIXEL_RATIO = 2;
// Albédo des calques gris (render_avatar_layers.py, GREY_ALBEDO).
const GREY_ALBEDO = [236, 236, 236];
// Poses ajoutées après la base, une meta chacune (render_avatar.py,
// POSE_GROUPS), dans l'ordre de l'index.
const EXTRA_POSES = ['lie', 'sit_low'];

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

/** Les calques attendus, dans l'ordre de l'index. */
export function layerIds(spec) {
  return [
    ...Object.keys(spec.skins).map((s) => `body.${s}`),
    ...Object.keys(spec.outfits).flatMap((o) => [`top.${o}`, `bottom.${o}`]),
    ...spec.hairs.map((h) => `hair.${h}`),
  ];
}

function runBlender(blender, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      blender,
      [
        '-b',
        '--factory-startup',
        '--disable-autoexec',
        '-P',
        path.join(HERE, 'render_avatar_layers.py'),
        '--',
        ...args,
      ],
      { cwd: HERE }
    );
    let tail = '';
    const onData = (chunk) => {
      const text = chunk.toString('utf8');
      tail = `${tail}${text}`.slice(-8000);
      for (const line of text.split('\n'))
        if (/^LIBRARY_LAYER/.test(line)) console.log(line.trim());
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 && tail.includes('LIBRARY_LAYERS_OK')) resolve();
      else {
        console.error(tail.split('\n').slice(-40).join('\n'));
        reject(new Error(`render_avatar_layers.py en échec (code ${code})`));
      }
    });
  });
}

/**
 * Les animations d'une meta de calque au format de l'index, ou null si une
 * de ses feuilles manque.
 */
function indexAnimations(meta) {
  const out = {};
  for (const [name, a] of Object.entries(meta.animations)) {
    if (!existsSync(path.join(OUT_DIR, a.file))) return null;
    const directions = Array.from({ length: 8 }, (_, d) =>
      Object.hasOwn(a.directions, String(d)) ? a.directions[String(d)] : null
    );
    out[name] = {
      sheet: `${URL_PREFIX}/${a.file}`,
      width: a.sheetWidth,
      height: a.sheetHeight,
      fps: a.fps,
      ...(a.strideMeters ? { strideMeters: a.strideMeters } : {}),
      directions,
    };
  }
  return out;
}

/**
 * L'index des calques rendus (ceux dont la meta et les feuilles existent) :
 * la base, puis chaque pose ajoutée dont la meta et la feuille existent.
 */
async function writeIndex(spec) {
  const layers = {};
  const missing = [];
  const missingPoses = Object.fromEntries(EXTRA_POSES.map((p) => [p, []]));
  for (const id of layerIds(spec)) {
    const metaPath = path.join(META_DIR, `${id}.json`);
    if (!existsSync(metaPath)) {
      missing.push(id);
      continue;
    }
    const entry = indexAnimations(
      JSON.parse(await readFile(metaPath, 'utf8'))
    );
    if (!entry) {
      missing.push(id);
      continue;
    }
    for (const pose of EXTRA_POSES) {
      const posePath = path.join(META_DIR, `${id}@${pose}.json`);
      const extra = existsSync(posePath)
        ? indexAnimations(JSON.parse(await readFile(posePath, 'utf8')))
        : null;
      if (extra?.[pose]) entry[pose] = extra[pose];
      else missingPoses[pose].push(id);
    }
    layers[id] = entry;
  }
  const index = {
    version: 1,
    tile: TILE,
    pixelRatio: PIXEL_RATIO,
    greyAlbedo: GREY_ALBEDO,
    layers,
  };
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    path.join(OUT_DIR, 'layers.json'),
    `${JSON.stringify(index)}\n`
  );
  const posesNote = EXTRA_POSES.map((p) =>
    missingPoses[p].length
      ? `${p} manquante pour ${missingPoses[p].length} calque(s)`
      : `${p} complète`
  ).join(', ');
  console.log(
    `index : ${Object.keys(layers).length} calques${missing.length ? `, manquants : ${missing.join(', ')}` : ''} ; ${posesNote}`
  );
}

const { values } = parseArgs({
  options: {
    only: { type: 'string' },
    samples: { type: 'string', default: '32' },
    quality: { type: 'string', default: '82' },
    preview: { type: 'boolean', default: false },
    index: { type: 'boolean', default: false },
    // Recadre serré des feuilles d'un ancien rendu (ancre gardée dans le
    // cadre), sans nouveau rendu.
    repack: { type: 'boolean', default: false },
    // Poses à rendre (par groupes entiers : idle,walk,sit ou lie ou sit_low),
    // toutes par défaut. Les poses déjà rendues avec la même empreinte sont
    // sautées.
    poses: { type: 'string' },
  },
});

const spec = JSON.parse(
  await readFile(path.join(HERE, 'avatar-layers.json'), 'utf8')
);
if (!values.index) {
  const sources = await readSources();
  const hdri = await fetchHdri(sources.hdri);
  const base = await fetchAvatarBase(sources.avatarBase);
  await mkdir(path.dirname(SPEC_PATH), { recursive: true });
  await mkdir(META_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(SPEC_PATH, JSON.stringify(spec));
  const started = Date.now();
  try {
    await runBlender(findBlender(), [
      '--bundle',
      base.path,
      '--hdri',
      hdri.path,
      '--spec',
      SPEC_PATH,
      '--out',
      OUT_DIR,
      '--meta',
      META_DIR,
      '--samples',
      values.samples,
      '--quality',
      values.quality,
      ...(values.only ? ['--only', values.only] : []),
      ...(values.poses ? ['--poses', values.poses] : []),
      ...(values.preview ? ['--preview'] : []),
      ...(values.repack ? ['--repack'] : []),
    ]);
  } finally {
    console.log(
      `calques : ${Math.round((Date.now() - started) / 1000)} s (aperçus : ${META_DIR})`
    );
    if (!values.preview) await writeIndex(spec);
  }
} else {
  await writeIndex(spec);
}
