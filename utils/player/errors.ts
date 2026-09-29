// utils/player/errors.ts — erreurs typées de l'espace joueuse (lot P4,
// docs/PLAN-industrialisation-joueur.md).
//
// POURQUOI. Les routes joueuse écrivent leurs erreurs à la main, en français
// libre : l'UI ne peut qu'afficher ce texte, jamais le traduire. P4 pose un
// CATALOGUE de codes stables, partagé avec l'admin quand le code existe
// (`AdminErrorCode`), traduit côté client par le namespace `playerErrors`
// (lib/i18n/locales/{fr,en}/playerErrors.ts). Le texte serveur `error` reste
// TOUJOURS présent : c'est le repli d'affichage et le contrat historique.
//
//   { error: string, code: PlayerErrorCode | <code historique>, fields?, reason?, requestId? }
//
// Deux usages :
//   * route migrée (`defineSubjectRoute`) : le service LÈVE une `PlayerError`
//     (sous-classe d'`AdminError`, donc sérialisée par le noyau
//     utils/http/defineRoute.ts, `requestId` compris) ;
//   * route historique : `parseBody(schema, req.body)` valide le corps avec le
//     schéma zod PARTAGÉ (`features/player/<domaine>/schemas.ts`) et rend le
//     corps d'erreur typé à renvoyer tel quel.

import type { z } from 'zod';
import { AdminError, type AdminErrorCode } from '@/utils/admin/errors';

/**
 * Catalogue des codes joueuse. Les codes génériques sont ceux de l'admin ;
 * s'y ajoutent les refus propres à la garde « sujet ». Tout code ajouté ici
 * DOIT l'être aussi dans `playerErrors` (FR + EN) — cf.
 * tests/unit/playerErrors.test.ts.
 */
export const PLAYER_ERROR_CODES = [
  'validation',
  'unauthenticated',
  'forbidden',
  'not_found',
  'conflict',
  'precondition',
  'rate_limited',
  'method_not_allowed',
  'service_unavailable',
  'internal',
  // Garde « sujet » (utils/subject.ts `SubjectErrorCode`).
  'invalid_subject',
  'subject_read_only',
  'subject_forbidden',
  'subject_not_found',
  'subject_unsupported',
] as const;

export type PlayerErrorCode = (typeof PLAYER_ERROR_CODES)[number];

export function isPlayerErrorCode(code: unknown): code is PlayerErrorCode {
  return (
    typeof code === 'string' &&
    (PLAYER_ERROR_CODES as readonly string[]).includes(code)
  );
}

export type PlayerErrorBody = {
  error: string;
  /**
   * Code du catalogue, ou code HISTORIQUE d'une route (`INVALID_BODY`,
   * `invalid_body`…) que l'UI, le bot ou les tests lisent déjà : on ne le
   * renomme jamais, on ne l'invente jamais non plus.
   */
  code: PlayerErrorCode | (string & {});
  /** Message par champ (clé = chemin zod joint par `.`). */
  fields?: Record<string, string>;
  /** Raison métier fine (refus `precondition`), stable et testable. */
  reason?: string;
  requestId?: string;
};

/** Erreur levée par un service joueuse ; le noyau la sérialise. */
export class PlayerError extends AdminError {
  constructor(
    status: number,
    code: PlayerErrorCode,
    message: string,
    extra: { fields?: Record<string, string>; reason?: string } = {}
  ) {
    // `PlayerErrorCode` ⊃ `AdminErrorCode` : les deux codes de sujet sont
    // hors du type admin, mais la sérialisation (`toBody`) est la même.
    super(status, code as AdminErrorCode, message, extra);
    this.name = 'PlayerError';
  }
}

/** `a.b` → message ; le premier message par champ gagne. */
export function zodIssueFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || '_';
    if (!(key in fields)) fields[key] = issue.message;
  }
  return fields;
}

export type ParseBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; body: PlayerErrorBody };

/**
 * Valide un corps de requête avec son schéma partagé.
 *
 * En échec, `error` vaut `message` s'il est fourni (message historique unique
 * de la route), sinon le message de la PREMIÈRE issue — les schémas portent
 * les messages historiques, champ par champ, dans l'ordre où la route les
 * testait. `code` vaut `code` s'il est fourni (code historique), sinon
 * `'validation'`. `fields` s'ajoute toujours.
 */
export function parseBody<S extends z.ZodType>(
  schema: S,
  body: unknown,
  opts: { message?: string; code?: string } = {}
): ParseBodyResult<z.output<S>> {
  const parsed = schema.safeParse(body ?? {});
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    body: {
      error:
        opts.message ?? parsed.error.issues[0]?.message ?? 'Requête invalide.',
      code: opts.code ?? 'validation',
      fields: zodIssueFields(parsed.error),
    },
  };
}
