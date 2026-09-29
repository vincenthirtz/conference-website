// features/player/network/service/context.ts — contexte et refus communs des
// services du réseau (lot P15). Extraits tels quels des routes historiques :
// mêmes statuts, mêmes codes (`INVALID_BODY`, `INVALID_QUERY`,
// `NOT_DISCOVERABLE`…), mêmes textes.

import type { AdminDb } from '@/utils/admin/serviceContext';
import { LegacyAdminError } from '@/utils/admin/errors';
import { parseBody } from '@/utils/player/errors';
import type { Logger } from '@/utils/logger';
import type { z } from 'zod';

export type NetworkCtx = {
  db: AdminDb;
  /** Tenant de la joueuse (seul le dossier d'adversaire s'en sert). */
  tenantId: string;
  logger: Logger;
  /** L'appelante — toutes les routes du réseau sont `subject: 'self'`. */
  userId: string;
};

export const serverError = () => new LegacyAdminError(500, 'Erreur serveur.');

/** 404 uniforme : « inconnue » et « non découvrable » ne se distinguent pas. */
export const notDiscoverable = () =>
  new LegacyAdminError(404, 'Joueur introuvable ou non découvrable.', {
    code: 'NOT_DISCOVERABLE',
  });

/**
 * Valide avec le schéma partagé et lève le refus HISTORIQUE (`INVALID_BODY`
 * / `INVALID_QUERY`, message « Validation échouée. ») plutôt que le
 * `validation` du noyau : l'interface et les tests lisent ce code.
 */
export function parseOrThrow<S extends z.ZodType>(
  schema: S,
  input: unknown,
  code: 'INVALID_BODY' | 'INVALID_QUERY'
): z.output<S> {
  const parsed = parseBody(schema, input, {
    message: 'Validation échouée.',
    code,
  });
  if (parsed.ok) return parsed.data;
  throw new LegacyAdminError(400, parsed.body.error, {
    code: parsed.body.code,
    extra: { fields: parsed.body.fields },
  });
}
