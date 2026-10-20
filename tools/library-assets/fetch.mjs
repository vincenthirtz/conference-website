// Télécharge les sources 3D (CC0, Poly Haven) dans un cache hors du dépôt.
// Seuls les sprites rendus sont versionnés ; les modèles restent dans le cache
// (LIBRARY_ASSETS_CACHE, par défaut ~/.cache/womens-library-assets).

import { spawnSync } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const API = 'https://api.polyhaven.com';
// Seules origines de téléchargement acceptées.
const DOWNLOAD_HOSTS = new Set(['dl.polyhaven.org', 'mirror.blender.org']);

export const CACHE_DIR =
  process.env.LIBRARY_ASSETS_CACHE ??
  path.join(os.homedir(), '.cache', 'womens-library-assets');

// Le grand catalogue (lot 11) vit dans son propre fichier : meubles et
// variantes de couleur, textures en plus, licences revérifiées. Il s'ajoute à
// sources.json (décor, avatars, meubles du lot 3) sans en écraser une clé.
const EXTRA_SOURCES = ['sources-furniture.json'];

export async function readSources() {
  const raw = await readFile(path.join(HERE, 'sources.json'), 'utf8');
  const sources = JSON.parse(raw);
  for (const file of EXTRA_SOURCES) {
    let extra;
    try {
      extra = JSON.parse(await readFile(path.join(HERE, file), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      throw err;
    }
    for (const section of ['textures', 'furniture']) {
      for (const [key, value] of Object.entries(extra[section] ?? {})) {
        sources[section] ??= {};
        if (Object.hasOwn(sources[section], key))
          throw new Error(`${file} : ${section}.${key} existe déjà`);
        sources[section][key] = value;
      }
    }
    sources.licenses = {
      ...(sources.licenses ?? {}),
      ...(extra.licenses ?? {}),
    };
  }
  return sources;
}

// La licence de Poly Haven est revérifiée à chaque import (une fois par
// build) : sa page doit toujours dire que TOUS ses assets sont en CC0. Sinon
// rien n'est importé.
let polyHavenLicense = null;
export function verifyPolyHavenLicense() {
  polyHavenLicense ??= (async () => {
    const res = await fetch('https://polyhaven.com/license');
    if (!res.ok)
      throw new Error(`licence Poly Haven illisible (${res.status})`);
    const text = (await res.text())
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');
    if (!/assets are all licensed as CC0/i.test(text))
      throw new Error(
        'la page https://polyhaven.com/license ne dit plus « all licensed as CC0 » : import arrêté'
      );
    return 'CC0 1.0';
  })();
  return polyHavenLicense;
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} sur ${url}`);
  return res.json();
}

function assertDownloadUrl(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !DOWNLOAD_HOSTS.has(u.hostname)) {
    throw new Error(`origine refusée : ${url}`);
  }
}

// Un chemin fourni par l'API ne doit jamais sortir du dossier de l'asset.
function safeJoin(dir, relative) {
  const norm = path.posix.normalize(relative);
  if (norm.startsWith('..') || path.posix.isAbsolute(norm)) {
    throw new Error(`chemin refusé : ${relative}`);
  }
  return path.join(dir, ...norm.split('/'));
}

async function download(url, dest, expectedSize) {
  assertDownloadUrl(url);
  try {
    const s = await stat(dest);
    if (expectedSize == null || s.size === expectedSize) return;
  } catch {
    // absent du cache
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} sur ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (expectedSize != null && buf.length !== expectedSize) {
    throw new Error(`taille inattendue pour ${url}`);
  }
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
}

const creditCache = new Map();
async function credit(id) {
  if (!creditCache.has(id))
    creditCache.set(
      id,
      (async () => {
        const license = await verifyPolyHavenLicense();
        const info = await getJson(`${API}/info/${encodeURIComponent(id)}`);
        return {
          id,
          name: info.name,
          authors: Object.keys(info.authors ?? {}),
          url: `https://polyhaven.com/a/${id}`,
          license,
        };
      })()
    );
  return creditCache.get(id);
}

export async function fetchModel({ provider, id, resolution }) {
  if (provider !== 'polyhaven')
    throw new Error(`source inconnue : ${provider}`);
  const files = await getJson(`${API}/files/${encodeURIComponent(id)}`);
  const entry = files?.gltf?.[resolution]?.gltf;
  if (!entry) throw new Error(`pas de glTF ${resolution} pour ${id}`);
  const dir = path.join(CACHE_DIR, 'polyhaven', 'models', id, resolution);
  const gltfPath = safeJoin(
    dir,
    path.posix.basename(new URL(entry.url).pathname)
  );
  await download(entry.url, gltfPath, entry.size);
  for (const [relative, include] of Object.entries(entry.include ?? {})) {
    await download(include.url, safeJoin(dir, relative), include.size);
  }
  return { path: gltfPath, credit: await credit(id) };
}

// Cartes d'une texture Poly Haven (JPG seulement : diffuse, normale OpenGL,
// rugosité). Renvoie les chemins locaux par carte ; une carte absente est
// omise (le rendu s'en passe), la diffuse est obligatoire.
const TEXTURE_MAPS = { diffuse: 'Diffuse', normal: 'nor_gl', rough: 'Rough' };

export async function fetchTexture({ provider, id, resolution }) {
  if (provider !== 'polyhaven')
    throw new Error(`source inconnue : ${provider}`);
  const files = await getJson(`${API}/files/${encodeURIComponent(id)}`);
  const dir = path.join(CACHE_DIR, 'polyhaven', 'textures', id, resolution);
  const maps = {};
  for (const [name, key] of Object.entries(TEXTURE_MAPS)) {
    const entry = files?.[key]?.[resolution]?.jpg;
    if (!entry) continue;
    const dest = safeJoin(
      dir,
      path.posix.basename(new URL(entry.url).pathname)
    );
    await download(entry.url, dest, entry.size);
    maps[name] = dest;
  }
  if (!maps.diffuse) throw new Error(`pas de diffuse ${resolution} pour ${id}`);
  return { maps, credit: await credit(id) };
}

export async function fetchHdri({ provider, id, resolution }) {
  if (provider !== 'polyhaven')
    throw new Error(`source inconnue : ${provider}`);
  const files = await getJson(`${API}/files/${encodeURIComponent(id)}`);
  const entry = files?.hdri?.[resolution]?.hdr;
  if (!entry) throw new Error(`pas de HDRI ${resolution} pour ${id}`);
  const dir = path.join(CACHE_DIR, 'polyhaven', 'hdris', id, resolution);
  const hdrPath = safeJoin(
    dir,
    path.posix.basename(new URL(entry.url).pathname)
  );
  await download(entry.url, hdrPath, entry.size);
  return { path: hdrPath, credit: await credit(id) };
}

// Base anatomique des avatars : le bundle « Human Base Meshes » (CC0) de la
// Blender Studio. L'archive est extraite par tar, qui refuse les chemins en
// « .. » ; on vérifie ensuite que le .blend attendu est bien là.
export async function fetchAvatarBase({ provider, id, version, url, blend }) {
  if (provider !== 'blender-studio') {
    throw new Error(`source inconnue : ${provider}`);
  }
  const dir = path.join(CACHE_DIR, provider, id, version);
  const blendPath = safeJoin(path.join(dir, 'extracted'), blend);
  try {
    await stat(blendPath);
  } catch {
    const zip = path.join(dir, 'bundle.zip');
    await download(url, zip, null);
    await mkdir(path.join(dir, 'extracted'), { recursive: true });
    const run = spawnSync('tar', [
      '-xf',
      zip,
      '-C',
      path.join(dir, 'extracted'),
    ]);
    if (run.status !== 0) throw new Error(`extraction de ${zip} en échec`);
    await stat(blendPath);
  }
  return {
    path: blendPath,
    credit: {
      id,
      name: `Human Base Meshes v${version}`,
      authors: ['Blender Studio', 'communauté Blender'],
      url: 'https://www.blender.org/download/demo-files/',
      license: 'CC0 1.0',
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sources = await readSources();
  const hdri = await fetchHdri(sources.hdri);
  console.log(`hdri ${hdri.path}`);
  // Modèles seuls : un meuble généré ou une variante n'a rien à télécharger.
  for (const [key, source] of Object.entries(sources.furniture)) {
    if (source.provider !== 'polyhaven') continue;
    const model = await fetchModel(source);
    console.log(`${key} ${model.path}`);
  }
}
