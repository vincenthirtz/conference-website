// utils/storage/mediaStore.ts
//
// ÉCRIRE ET EFFACER LES FICHIERS, côté serveur, sur Supabase Storage ou sur R2
// (Cloudflare). Toutes les routes passent par ici : la bascule, et son retour
// arrière, tiennent dans une variable — `MEDIA_BACKEND` — au lieu de douze
// fichiers (conference-website, docs/R2-MEDIA.md).
//
// `MEDIA_BACKEND` absente, vide ou `supabase` : CHAQUE APPEL EST CELUI D'AVANT,
// `supabaseAdmin.storage.from(<bucket>).<méthode>(…)` avec les mêmes options —
// mêmes en-têtes, même retour `{ data, error }`, mêmes exceptions. Les routes
// gardent leur gestion d'erreur telle quelle.
//
// `MEDIA_BACKEND=r2` : API S3 de R2, signée en SigV4 par `aws4fetch`.
//   - envoi : PUT avec `Content-Type` et `Cache-Control: public, max-age=<n>`
//     (même durée que celle donnée à Supabase, 1 h par défaut comme lui) ; sans
//     `upsert`, `If-None-Match: *` refuse d'écraser un objet existant — le
//     comportement de Supabase, sur lequel reposent les caches d'un an
//     (`utils/uploads/storageCache.ts`) ;
//   - suppression : un DELETE par clé (un objet absent est un succès, comme
//     sur Supabase) ;
//   - preuves de match (bucket PRIVÉ) : lien GET présigné, à durée bornée.
//   Configuration INCOMPLÈTE (clés, compte, ou adresse publique des médias) :
//   l'appel rend une erreur, journalisée une fois — jamais un repli silencieux
//   sur Supabase, qui écrirait des fichiers là où la base ne les cherche plus.
//
// SERVEUR SEULEMENT (clés R2, client d'admin). Les adresses publiques, elles,
// se calculent sans rien de tout ça : `./mediaUrl.ts`.

import { AwsClient } from 'aws4fetch';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { registerProcessCache } from '@/utils/processCaches';
import { MEDIA_SUPABASE_BUCKET, mediaBaseUrl } from './mediaUrl';

/** Bucket Supabase PRIVÉ des preuves de match. */
export const EVIDENCE_SUPABASE_BUCKET = 'match-evidence';

export const R2_DEFAULT_MEDIA_BUCKET = 'owwomenscup-media';
export const R2_DEFAULT_EVIDENCE_BUCKET = 'owwomenscup-evidence';
export const R2_DEFAULT_JURISDICTION = 'eu';

/** Durée de cache par défaut d'un objet, celle de Supabase (`'3600'`). */
const DEFAULT_CACHE_SECONDS = '3600';
/** Plafond d'un lien présigné S3/R2 : sept jours. */
const MAX_PRESIGN_SECONDS = 7 * 24 * 3600;
/** Une écriture R2 qui ne répond pas ne doit pas retenir la route. */
const R2_TIMEOUT_MS = 30_000;

export type StorageFailure = { message: string };
export type StorageResult<T> = { data: T | null; error: StorageFailure | null };

export type UploadMediaOptions = {
  contentType: string;
  /** Défaut `false` (Supabase) : un chemin existant n'est pas écrasé. */
  upsert?: boolean;
  /** Secondes, en chaîne (option `cacheControl` de Supabase). Défaut 3600. */
  cacheControl?: string;
};

/* -------------------------------------------------------------------------- */
/* Aiguillage                                                                  */
/* -------------------------------------------------------------------------- */

type R2Config = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  mediaBucket: string;
  evidenceBucket: string;
};

type Backend =
  | { kind: 'supabase' }
  | { kind: 'r2'; config: R2Config }
  | { kind: 'invalid'; message: string };

const BUCKET_NAME = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

/** Lu à chaque appel : basculer = changer la variable et redémarrer. */
function resolveBackend(): Backend {
  warnOnUnusableBaseUrl();
  const raw = (process.env.MEDIA_BACKEND ?? '').trim().toLowerCase();
  if (raw === '' || raw === 'supabase') return { kind: 'supabase' };
  if (raw !== 'r2') {
    return invalid(
      `MEDIA_BACKEND inconnu (« ${raw} ») : « supabase » ou « r2 » attendu.`
    );
  }

  const env = process.env;
  const accountId = env.R2_ACCOUNT_ID?.trim() ?? '';
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim() ?? '';
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim() ?? '';
  const missing = [
    ['R2_ACCOUNT_ID', accountId],
    ['R2_ACCESS_KEY_ID', accessKeyId],
    ['R2_SECRET_ACCESS_KEY', secretAccessKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    return invalid(`MEDIA_BACKEND=r2 sans ${missing.join(', ')}.`);
  }
  // Il entre dans un nom d'hôte : on n'y laisse passer que sa forme réelle.
  if (!/^[a-f0-9]{32}$/i.test(accountId)) {
    return invalid('R2_ACCOUNT_ID invalide (32 caractères hexadécimaux).');
  }
  const jurisdiction = (
    env.R2_JURISDICTION?.trim() || R2_DEFAULT_JURISDICTION
  ).toLowerCase();
  if (jurisdiction !== 'none' && !/^[a-z0-9-]{1,32}$/.test(jurisdiction)) {
    return invalid('R2_JURISDICTION invalide (« eu », « none »…).');
  }
  const mediaBucket = env.R2_MEDIA_BUCKET?.trim() || R2_DEFAULT_MEDIA_BUCKET;
  const evidenceBucket =
    env.R2_EVIDENCE_BUCKET?.trim() || R2_DEFAULT_EVIDENCE_BUCKET;
  if (!BUCKET_NAME.test(mediaBucket) || !BUCKET_NAME.test(evidenceBucket)) {
    return invalid('R2_MEDIA_BUCKET ou R2_EVIDENCE_BUCKET invalide.');
  }

  // Un bucket de juridiction (UE) n'est joignable que par SON point d'accès :
  // `<compte>.eu.r2.cloudflarestorage.com`.
  const region = jurisdiction === 'none' ? '' : `.${jurisdiction}`;
  return {
    kind: 'r2',
    config: {
      endpoint: `https://${accountId.toLowerCase()}${region}.r2.cloudflarestorage.com`,
      accessKeyId,
      secretAccessKey,
      mediaBucket,
      evidenceBucket,
    },
  };
}

const loggedOnce = new Set<string>();
registerProcessCache(() => loggedOnce.clear());

function logOnce(message: string) {
  if (loggedOnce.has(message)) return;
  loggedOnce.add(message);
  logger.error('[storage] %s', message);
}

function invalid(message: string): Backend {
  logOnce(message);
  return { kind: 'invalid', message };
}

/** Une base posée mais refusée par `mediaBaseUrl()` ne doit pas passer inaperçue. */
function warnOnUnusableBaseUrl() {
  const raw = (
    process.env.MEDIA_BASE_URL || process.env.NEXT_PUBLIC_MEDIA_BASE_URL
  )?.trim();
  if (raw && !mediaBaseUrl()) {
    logOnce(
      'MEDIA_BASE_URL / NEXT_PUBLIC_MEDIA_BASE_URL ignorée : origine https attendue, sans requête ni ancre.'
    );
  }
}

function failure<T>(message: string): StorageResult<T> {
  return { data: null, error: { message } };
}

/**
 * Les ENVOIS vers R2 exigent aussi l'adresse publique des médias : sans elle,
 * l'URL rendue pointerait vers Supabase, où le fichier n'est pas — une image
 * morte, sans erreur. Mieux vaut refuser l'envoi.
 */
function r2MediaWriteRefusal(): string | null {
  if (mediaBaseUrl()) return null;
  const message =
    'MEDIA_BACKEND=r2 sans MEDIA_BASE_URL (ni NEXT_PUBLIC_MEDIA_BASE_URL) : les adresses rendues pointeraient vers Supabase.';
  logOnce(message);
  return message;
}

/* -------------------------------------------------------------------------- */
/* API publique                                                                */
/* -------------------------------------------------------------------------- */

/** Envoie un fichier dans le bucket PUBLIC des médias. */
export async function uploadMedia(
  path: string,
  body: Buffer,
  options: UploadMediaOptions
): Promise<StorageResult<{ path: string }>> {
  const backend = resolveBackend();
  if (backend.kind === 'invalid') return failure(backend.message);
  if (backend.kind === 'supabase') {
    // Seules les options DONNÉES sont transmises : storage-js étale les
    // options sur ses défauts, et une clé `undefined` écraserait le défaut
    // (`cache-control: max-age=undefined`).
    const opts: UploadMediaOptions = { contentType: options.contentType };
    if (options.upsert !== undefined) opts.upsert = options.upsert;
    if (options.cacheControl !== undefined) {
      opts.cacheControl = options.cacheControl;
    }
    return supabaseAdmin.storage
      .from(MEDIA_SUPABASE_BUCKET)
      .upload(path, body, opts);
  }
  const refusal = r2MediaWriteRefusal();
  if (refusal) return failure(refusal);
  return r2Put(backend.config, backend.config.mediaBucket, path, body, {
    contentType: options.contentType,
    cacheControl: `public, max-age=${options.cacheControl ?? DEFAULT_CACHE_SECONDS}`,
    overwrite: options.upsert === true,
  });
}

/** Supprime des fichiers du bucket PUBLIC. Un fichier absent n'est pas une erreur. */
export async function removeMedia(
  paths: string[]
): Promise<StorageResult<unknown>> {
  const backend = resolveBackend();
  if (backend.kind === 'invalid') return failure(backend.message);
  if (backend.kind === 'supabase') {
    return supabaseAdmin.storage.from(MEDIA_SUPABASE_BUCKET).remove(paths);
  }
  return r2Delete(backend.config, backend.config.mediaBucket, paths);
}

/** Copie un fichier du bucket PUBLIC vers un nouveau chemin du même bucket. */
export async function copyMedia(
  fromPath: string,
  toPath: string
): Promise<StorageResult<{ path: string }>> {
  const backend = resolveBackend();
  if (backend.kind === 'invalid') return failure(backend.message);
  if (backend.kind === 'supabase') {
    return supabaseAdmin.storage
      .from(MEDIA_SUPABASE_BUCKET)
      .copy(fromPath, toPath);
  }
  const refusal = r2MediaWriteRefusal();
  if (refusal) return failure(refusal);
  return r2Copy(backend.config, backend.config.mediaBucket, fromPath, toPath);
}

/** Envoie une preuve de match dans le bucket PRIVÉ (jamais d'écrasement). */
export async function uploadEvidence(
  path: string,
  body: Buffer,
  options: { contentType: string }
): Promise<StorageResult<{ path: string }>> {
  const backend = resolveBackend();
  if (backend.kind === 'invalid') return failure(backend.message);
  if (backend.kind === 'supabase') {
    return supabaseAdmin.storage
      .from(EVIDENCE_SUPABASE_BUCKET)
      .upload(path, body, { contentType: options.contentType, upsert: false });
  }
  return r2Put(backend.config, backend.config.evidenceBucket, path, body, {
    contentType: options.contentType,
    // Bucket privé, lu par liens signés : aucun cache partagé.
    cacheControl: `private, max-age=${DEFAULT_CACHE_SECONDS}`,
    overwrite: false,
  });
}

/**
 * Lien de lecture temporaire d'une preuve. Sur R2, le lien est présigné sans
 * aller-retour : un objet absent donne un lien valide qui répondra 404 (là où
 * Supabase refusait de signer).
 */
export async function signedEvidenceUrl(
  path: string,
  ttlSeconds: number
): Promise<StorageResult<{ signedUrl: string }>> {
  const backend = resolveBackend();
  if (backend.kind === 'invalid') return failure(backend.message);
  if (backend.kind === 'supabase') {
    return supabaseAdmin.storage
      .from(EVIDENCE_SUPABASE_BUCKET)
      .createSignedUrl(path, ttlSeconds);
  }
  return r2Presign(
    backend.config,
    backend.config.evidenceBucket,
    path,
    ttlSeconds
  );
}

/* -------------------------------------------------------------------------- */
/* R2 (API S3)                                                                 */
/* -------------------------------------------------------------------------- */

let cachedClient: { key: string; client: AwsClient } | null = null;
registerProcessCache(() => {
  cachedClient = null;
});

function r2Client(config: R2Config): AwsClient {
  const key = `${config.accessKeyId}:${config.secretAccessKey}`;
  if (cachedClient?.key !== key) {
    cachedClient = {
      key,
      client: new AwsClient({
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        service: 's3',
        region: 'auto',
        // Deux reprises sur 5xx / 429, pas dix (défaut d'aws4fetch) : une
        // route attend la réponse.
        retries: 2,
      }),
    };
  }
  return cachedClient.client;
}

/** Même nettoyage que Supabase (`/` de tête, de fin, doublés) ; `null` si hors bucket. */
function objectKey(path: string): string | null {
  const key = path.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
  if (!key) return null;
  if (key.split('/').some((s) => s === '.' || s === '..')) return null;
  return key;
}

/** Encodage RFC 3986 segment par segment : celui que signe SigV4 pour S3. */
function encodeKey(key: string): string {
  return key
    .split('/')
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
      )
    )
    .join('/');
}

function objectUrl(config: R2Config, bucket: string, key: string): string {
  return `${config.endpoint}/${bucket}/${encodeKey(key)}`;
}

async function describeFailure(
  op: string,
  target: string,
  res: Response
): Promise<string> {
  const text = await res.text().catch(() => '');
  const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1];
  if (res.status === 412) {
    return `R2 ${op} ${target} : l'objet existe déjà (HTTP 412).`;
  }
  return `R2 ${op} ${target} : HTTP ${res.status}${code ? ` ${code}` : ''}.`;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function r2Put(
  config: R2Config,
  bucket: string,
  path: string,
  body: Buffer,
  opts: { contentType: string; cacheControl: string; overwrite: boolean }
): Promise<StorageResult<{ path: string }>> {
  const key = objectKey(path);
  if (!key) return failure(`R2 PUT : chemin invalide (« ${path} »).`);
  const headers: Record<string, string> = {
    'Content-Type': opts.contentType,
    'Cache-Control': opts.cacheControl,
  };
  if (!opts.overwrite) headers['If-None-Match'] = '*';
  try {
    const res = await r2Client(config).fetch(objectUrl(config, bucket, key), {
      method: 'PUT',
      headers,
      // Copie dans un ArrayBuffer propre : ce que `fetch` accepte sans réserve.
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(R2_TIMEOUT_MS),
    });
    if (!res.ok) {
      return failure(await describeFailure('PUT', `${bucket}/${key}`, res));
    }
    return { data: { path: key }, error: null };
  } catch (err) {
    return failure(`R2 PUT ${bucket}/${key} : ${errorText(err)}`);
  }
}

async function r2Copy(
  config: R2Config,
  bucket: string,
  fromPath: string,
  toPath: string
): Promise<StorageResult<{ path: string }>> {
  const from = objectKey(fromPath);
  const to = objectKey(toPath);
  if (!from || !to) {
    return failure(
      `R2 COPY : chemin invalide (« ${fromPath} » → « ${toPath} »).`
    );
  }
  try {
    const res = await r2Client(config).fetch(objectUrl(config, bucket, to), {
      method: 'PUT',
      // Les métadonnées (Content-Type, Cache-Control) suivent la copie.
      headers: { 'x-amz-copy-source': `/${bucket}/${encodeKey(from)}` },
      signal: AbortSignal.timeout(R2_TIMEOUT_MS),
    });
    if (!res.ok) {
      return failure(await describeFailure('COPY', `${bucket}/${from}`, res));
    }
    // S3 peut répondre 200 avec une erreur dans le corps.
    const text = await res.text().catch(() => '');
    if (text.includes('<Error>')) {
      return failure(`R2 COPY ${bucket}/${from} : ${text.slice(0, 200)}`);
    }
    return { data: { path: to }, error: null };
  } catch (err) {
    return failure(`R2 COPY ${bucket}/${from} : ${errorText(err)}`);
  }
}

async function r2Delete(
  config: R2Config,
  bucket: string,
  paths: string[]
): Promise<StorageResult<unknown>> {
  const results = await Promise.all(
    paths.map(async (path) => {
      const key = objectKey(path);
      if (!key) return { path, error: `chemin invalide (« ${path} »)` };
      try {
        const res = await r2Client(config).fetch(
          objectUrl(config, bucket, key),
          { method: 'DELETE', signal: AbortSignal.timeout(R2_TIMEOUT_MS) }
        );
        // 204 même quand l'objet n'existait pas ; 404 vaut aussi « parti ».
        if (res.ok || res.status === 404) return { path: key, error: null };
        return {
          path: key,
          error: await describeFailure('DELETE', `${bucket}/${key}`, res),
        };
      } catch (err) {
        return { path: key, error: errorText(err) };
      }
    })
  );
  const failed = results.filter((r) => r.error);
  if (failed.length > 0) {
    return failure(
      `R2 DELETE : ${failed.length}/${paths.length} non supprimé(s) — ${failed[0].error}`
    );
  }
  return { data: results.map((r) => ({ name: r.path })), error: null };
}

async function r2Presign(
  config: R2Config,
  bucket: string,
  path: string,
  ttlSeconds: number
): Promise<StorageResult<{ signedUrl: string }>> {
  const key = objectKey(path);
  if (!key) return failure(`R2 GET : chemin invalide (« ${path} »).`);
  const ttl = Math.min(
    MAX_PRESIGN_SECONDS,
    Math.max(1, Math.floor(Number(ttlSeconds) || 0))
  );
  try {
    const url = new URL(objectUrl(config, bucket, key));
    url.searchParams.set('X-Amz-Expires', String(ttl));
    const signed = await r2Client(config).sign(url.toString(), {
      method: 'GET',
      aws: { signQuery: true },
    });
    return { data: { signedUrl: signed.url }, error: null };
  } catch (err) {
    return failure(`R2 GET ${bucket}/${key} : ${errorText(err)}`);
  }
}
