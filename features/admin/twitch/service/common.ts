// features/admin/twitch/service/common.ts — briques partagées des actions
// Twitch : jeton broadcaster, scope, appel Helix, erreurs au format historique
// (`{ error, code: 'NOT_CONNECTED' | 'MISSING_SCOPE' | 'TWITCH_…' }`).
//
// Le jeton déchiffré ne quitte JAMAIS ce module et ses appelants : il sert à
// l'en-tête Helix, n'entre ni dans une réponse, ni dans un journal.

import type { z } from 'zod';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { AdminError, LegacyAdminError } from '@/utils/admin/errors';
import {
  getValidBroadcasterToken,
  hasScope,
  type ValidBroadcasterToken,
} from '@/utils/twitchBroadcaster';

/** Erreur au corps historique (`code` métier et champs annexes conservés). */
export function fail(
  status: number,
  error: string,
  code?: string,
  extra?: Record<string, unknown>
): LegacyAdminError {
  return new LegacyAdminError(status, error, { code, extra });
}

/**
 * Parse d'un corps avec l'échec historique des routes Twitch :
 * `400 { error: 'Invalid payload.', code: 'INVALID_PAYLOAD', details }`.
 */
export function parsePayload<S extends z.ZodType>(
  schema: S,
  raw: unknown,
  error = 'Invalid payload.'
): z.output<S> {
  const parsed = schema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  throw fail(400, error, 'INVALID_PAYLOAD', {
    details: parsed.error.flatten(),
  });
}

/** Le client non typé qu'attend utils/twitchBroadcaster. */
export function legacyDb(ctx: ServiceContext) {
  return ctx.db as unknown as Parameters<typeof getValidBroadcasterToken>[0];
}

/** Jeton de la chaîne connectée, ou 502 `TWITCH_TOKEN_ERROR` / 409 `NOT_CONNECTED`. */
export async function requireBroadcasterToken(
  ctx: ServiceContext,
  where: string
): Promise<ValidBroadcasterToken> {
  let token: ValidBroadcasterToken | null;
  try {
    token = await getValidBroadcasterToken(legacyDb(ctx), ctx.tenantId);
  } catch (err) {
    ctx.logger.error(`[${where}] token refresh error`, err);
    throw fail(
      502,
      'Twitch token unavailable (refresh failed).',
      'TWITCH_TOKEN_ERROR'
    );
  }
  if (!token) {
    throw fail(409, 'Aucune chaîne Twitch connectée.', 'NOT_CONNECTED');
  }
  return token;
}

/** 403 `MISSING_SCOPE` si la chaîne n'a pas accordé `scope`. */
export function requireScope(token: ValidBroadcasterToken, scope: string) {
  if (!hasScope(token.scope, scope)) {
    throw fail(
      403,
      `Scope manquant : ${scope}. Reconnecte la chaîne.`,
      'MISSING_SCOPE'
    );
  }
}

/** 502 `TWITCH_HELIX_ERROR` au message de la route. */
export const helixError = (error: string) =>
  fail(502, error, 'TWITCH_HELIX_ERROR');

/**
 * Appel Helix : une exception réseau devient le 502 `TWITCH_HELIX_ERROR` de
 * la route ; une erreur métier levée dedans passe telle quelle.
 */
export async function guardHelix<T>(
  ctx: ServiceContext,
  where: string,
  error: string,
  run: () => Promise<T>
): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof AdminError) throw err;
    ctx.logger.error(where, err);
    throw helixError(error);
  }
}

/** Corps JSON Helix, `null` s'il est illisible. */
export async function readJson<T>(upstream: Response): Promise<T | null> {
  return (await upstream.json().catch(() => null)) as T | null;
}
