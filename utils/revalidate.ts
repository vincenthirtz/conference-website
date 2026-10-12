// utils/revalidate.ts
//
// Point d'entrée UNIQUE de la régénération à la demande (ISR) des pages
// publiques. Aucun handler n'appelle `res.revalidate` directement : tout passe
// par `revalidatePaths`.
//
// POURQUOI. Les routes /api/* peuvent être servies par conference-api (Next
// standalone séparé, cf. docs/EDGE-API-PROXY.md). Là-bas, `res.revalidate`
// ne régénère rien d'utile : les pages publiques sont servies par Netlify et
// n'existent pas dans le build de l'API. Un retrait de photo TCG (RGPD) doit
// pourtant disparaître en secondes (utils/tcg/revalidatePlayerCard.ts).
//
// DEUX MODES, choisis à chaque appel d'après l'environnement :
//   - DISTANT : `REVALIDATE_REMOTE_URL` (https stricte) ET `REVALIDATE_SECRET`
//     définis → POST JSON `{ paths }` vers cette URL (la route
//     pages/api/internal/revalidate.ts du site Netlify), en-tête
//     `x-revalidate-secret`, timeout 8 s. À poser UNIQUEMENT côté
//     conference-api.
//   - LOCAL (défaut, variables absentes) : `res.revalidate(p)` pour chaque
//     chemin, en parallèle — exactement le comportement d'avant.
//
// BEST-EFFORT DANS LES DEUX MODES : ne lève jamais. Chaque chemin en échec est
// signalé à `onError` (journalisation propre à chaque site d'appel), la
// requête en cours n'échoue pas.

import type { NextApiResponse } from 'next';
import { logger } from '@/utils/logger';

export const REVALIDATE_SECRET_HEADER = 'x-revalidate-secret';
/** Plafond de chemins par appel distant (miroir de la route interne). */
export const REVALIDATE_MAX_PATHS = 50;
const REMOTE_TIMEOUT_MS = 8_000;

type RevalidatingResponse =
  | Partial<Pick<NextApiResponse, 'revalidate'>>
  | null
  | undefined;

export type RevalidateOptions = {
  /** Appelée une fois par chemin en échec. Défaut : `logger.error`. */
  onError?: (path: string, err: unknown) => void;
};

type RemoteConfig = { url: string; secret: string };

/**
 * Config du mode distant, ou `null` (mode local). L'URL doit être https,
 * sans identifiants ; le secret doit être une valeur d'en-tête sûre. Une
 * valeur invalide retombe en mode local (comportement d'avant) avec un
 * avertissement, plutôt que d'envoyer le secret n'importe où.
 */
export function resolveRemoteRevalidateConfig(
  env: Record<string, string | undefined> = process.env
): RemoteConfig | null {
  const rawUrl = (env.REVALIDATE_REMOTE_URL || '').trim();
  const secret = (env.REVALIDATE_SECRET || '').trim();
  if (!rawUrl || !secret) return null;
  if (!/^[\x21-\x7e]+$/.test(secret)) {
    logger.warn('[revalidate] REVALIDATE_SECRET invalide, mode local');
    return null;
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    logger.warn('[revalidate] REVALIDATE_REMOTE_URL illisible, mode local');
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    logger.warn('[revalidate] REVALIDATE_REMOTE_URL non https, mode local');
    return null;
  }
  return { url: url.toString(), secret };
}

function defaultOnError(path: string, err: unknown) {
  logger.error(`[revalidate] ${path} failed`, err);
}

async function revalidateRemote(
  config: RemoteConfig,
  paths: string[],
  onError: (path: string, err: unknown) => void
): Promise<void> {
  const batches: string[][] = [];
  for (let i = 0; i < paths.length; i += REVALIDATE_MAX_PATHS) {
    batches.push(paths.slice(i, i + REVALIDATE_MAX_PATHS));
  }
  await Promise.all(
    batches.map(async (batch) => {
      try {
        const resp = await fetch(config.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            [REVALIDATE_SECRET_HEADER]: config.secret,
          },
          body: JSON.stringify({ paths: batch }),
          signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
          redirect: 'error',
        });
        if (!resp.ok) {
          const err = new Error(`remote revalidate HTTP ${resp.status}`);
          for (const p of batch) onError(p, err);
          return;
        }
        const body = (await resp.json().catch(() => null)) as {
          failed?: unknown;
        } | null;
        const failed = Array.isArray(body?.failed)
          ? body.failed.filter((p): p is string => typeof p === 'string')
          : [];
        for (const p of failed) {
          if (batch.includes(p))
            onError(p, new Error('remote revalidate failed'));
        }
      } catch (err) {
        for (const p of batch) onError(p, err);
      }
    })
  );
}

/**
 * Régénère `paths` (chemins de pages, ex. `/player/abc`). Ne lève jamais.
 * Doublons et chaînes vides ignorés.
 */
export async function revalidatePaths(
  res: RevalidatingResponse,
  paths: string[],
  opts: RevalidateOptions = {}
): Promise<void> {
  const onError = opts.onError ?? defaultOnError;
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return;

  const remote = resolveRemoteRevalidateConfig();
  if (remote) {
    await revalidateRemote(remote, unique, onError);
    return;
  }

  // `res.revalidate` n'existe pas partout (doubles de réponse en test,
  // runtimes exotiques) : on ne suppose rien.
  if (typeof res?.revalidate !== 'function') return;
  const revalidate = res.revalidate.bind(res);
  await Promise.all(
    unique.map(async (path) => {
      try {
        await revalidate(path);
      } catch (err) {
        onError(path, err);
      }
    })
  );
}
