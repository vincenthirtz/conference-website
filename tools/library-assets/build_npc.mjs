// Rend les personnages non joueurs (PNJ) de la Women's Library et écrit leur
// index, À PART du manifeste des meubles : un PNJ n'est pas au catalogue (le
// catalogue est celui de l'API), il ne s'achète pas et ne se pose pas.
//
//   node tools/library-assets/build_npc.mjs                 # tous les PNJ
//   node tools/library-assets/build_npc.mjs --only ghost    # un seul
//
// Aujourd'hui un seul PNJ : le fantôme d'Halloween (lot 16 de
// docs/PLAN-womens-library.md), le modèle `ghost` du set Halloween
// (iso_furniture.gen_ghost), rendu sans ombre cuite parce qu'il flotte.
//
// Sortie (public/library/spike/npc/) :
//   - <clé>_d{0..7}.webp : une image par direction écran (engine/motion.ts) ;
//   - npc.json : l'index lu par le hall, et seulement par lui, tant que
//     l'événement est à l'affiche :
//       { version: 1, tile, pixelRatio,
//         npcs: { <clé>: { h, rad, d: [[largeur, hauteur, ax, ay] × 8] } } }
//     `h` = hauteur (m), `rad` = rayon au sol (m, pour l'ombre du moteur),
//     `d[k]` = image de la direction k (px à pixelRatio), ancre = point du sol
//     sous l'axe du modèle. L'image de la direction k est toujours
//     `<clé>_d<k>.webp` (même règle que les meubles compacts).
//
// Blender et la HDRI : les mêmes que build.mjs (variable BLENDER, sinon la
// version la plus récente de « C:\Program Files\Blender Foundation », sinon
// « blender » dans le PATH). Un PNJ rendu à part reste éclairé comme le reste.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { fetchHdri, readSources } from './fetch.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT_DIR = path.join(ROOT, 'public', 'library', 'spike', 'npc');
// Doit rester identique à iso_common.py, à build.mjs et au moteur.
const TILE = { width: 64, height: 32, meters: 0.5 };
const PIXEL_RATIO = 2;

/** Les PNJ : clé (nom des images) → générateur et réglages du rendu. */
const NPCS = {
  ghost: { generate: 'ghost', dirs: 8, scale: 1 },
};

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

function runBlender(blender, args, okToken) {
  const run = spawnSync(
    blender,
    [
      '-b',
      '--factory-startup',
      '--disable-autoexec',
      '-P',
      path.join(HERE, 'render_npc.py'),
      '--',
      ...args,
    ],
    { encoding: 'utf8', cwd: HERE, maxBuffer: 64 * 1024 * 1024 }
  );
  const log = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  if (run.status !== 0 || !log.includes(okToken)) {
    console.error(log.split('\n').slice(-40).join('\n'));
    throw new Error(`render_npc.py en échec (code ${run.status})`);
  }
  for (const line of log.split('\n'))
    if (line.startsWith('LIBRARY_NPC_OK')) console.log(line);
}

/** L'index sur disque, ou un index vide (un autre contrat de case : à refaire). */
async function readIndex(file) {
  try {
    const index = JSON.parse(await readFile(file, 'utf8'));
    return JSON.stringify(index.tile) === JSON.stringify(TILE) ? index : null;
  } catch {
    return null;
  }
}

/** Entrée COMPACTE d'un PNJ, d'après la méta écrite par render_npc.py. */
function compactNpc(meta, dirs) {
  const byDir = new Map(meta.frames.map((f) => [f.dir, f]));
  const d = [];
  for (let k = 0; k < dirs; k++) {
    const f = byDir.get(k);
    if (!f || f.file !== `${meta.key}_d${k}.webp`)
      throw new Error(`${meta.key} : direction ${k} manquante`);
    d.push([f.width, f.height, f.anchor.x, f.anchor.y]);
  }
  return { h: meta.height, rad: meta.radius, d };
}

const { values } = parseArgs({
  options: {
    only: { type: 'string' },
    samples: { type: 'string', default: '96' },
    quality: { type: 'string', default: '90' },
  },
});
const only = values.only ? new Set(values.only.split(',')) : null;
for (const key of only ?? [])
  if (!Object.hasOwn(NPCS, key)) throw new Error(`PNJ inconnu : ${key}`);

await mkdir(OUT_DIR, { recursive: true });
const sources = await readSources();
const hdri = await fetchHdri(sources.hdri);
const blender = findBlender();
const indexPath = path.join(OUT_DIR, 'npc.json');
const index = (await readIndex(indexPath)) ?? {};
const npcs = { ...(index.npcs ?? {}) };

for (const [key, npc] of Object.entries(NPCS)) {
  if (only && !only.has(key)) continue;
  const started = Date.now();
  runBlender(
    blender,
    [
      '--hdri',
      hdri.path,
      '--key',
      key,
      '--generate',
      npc.generate,
      '--out',
      OUT_DIR,
      '--dirs',
      String(npc.dirs),
      '--scale',
      String(npc.scale),
      '--samples',
      values.samples,
      '--quality',
      values.quality,
    ],
    `LIBRARY_NPC_OK ${key}`
  );
  const metaPath = path.join(OUT_DIR, `${key}.json`);
  const meta = JSON.parse(await readFile(metaPath, 'utf8'));
  npcs[key] = compactNpc(meta, npc.dirs);
  // La méta de travail ne part pas avec le site : l'index suffit.
  await rm(metaPath);
  console.log(`  ${key} en ${Math.round((Date.now() - started) / 1000)} s`);
}

// Une ligne par PNJ : compact pour le réseau, lisible en diff.
const keys = Object.keys(npcs).sort();
const body = keys
  .map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(npcs[k])}`)
  .join(',\n');
await writeFile(
  indexPath,
  `{\n  "version": 1,\n  "tile": ${JSON.stringify(TILE)},\n  "pixelRatio": ${PIXEL_RATIO},\n  "npcs": {\n${body}\n  }\n}\n`
);
console.log(`index : ${path.relative(ROOT, indexPath)} (${keys.join(', ')})`);
