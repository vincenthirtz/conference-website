// features/admin/matches/service/internal.ts — outils communs aux services
// du module : le 500 historique « Internal server error » des routes
// d'origine (leur `try/catch` englobant) et la traduction des erreurs du
// moteur de draft.

import { AdminError, LegacyAdminError } from '@/utils/admin/errors';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { DraftEngineError } from '@/utils/draftEngine';

/** Message du `catch` englobant des routes d'origine. */
export const INTERNAL_ERROR = 'Internal server error';

/**
 * Exécute `run` ; une erreur non typée devient le 500 historique (message
 * `fallback`), journalisée sous `label`. Une `AdminError` passe telle quelle.
 */
export async function withInternalError<R>(
  ctx: ServiceContext,
  label: string,
  run: () => Promise<R>,
  fallback: string = INTERNAL_ERROR
): Promise<R> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof AdminError) throw err;
    ctx.logger.error(label, err);
    throw new LegacyAdminError(500, fallback);
  }
}

/**
 * Erreur du moteur de draft → `{ error, code, ...detail }` au statut du moteur
 * (corps historique des routes `drafts/**`) ; toute autre erreur → 500.
 */
export async function withDraftErrors<R>(
  ctx: ServiceContext,
  label: string,
  run: () => Promise<R>
): Promise<R> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof AdminError) throw err;
    if (err instanceof DraftEngineError) {
      throw new LegacyAdminError(err.status, err.message, {
        code: err.code,
        extra: err.detail,
      });
    }
    ctx.logger.error(label, err);
    throw new LegacyAdminError(500, INTERNAL_ERROR);
  }
}
