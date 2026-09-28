// utils/admin/errors.ts — erreurs typées des routes admin (lot L4,
// docs/PLAN-industrialisation-admin.md).
//
// POURQUOI. 2 558 `res.json({ error: '…' })` écrits à la main, en français
// libre : le client ne peut distinguer un conflit d'une validation qu'en
// comparant du texte, et ne peut pas surligner le champ fautif.
//
// Un service LÈVE une `AdminError` ; `defineAdminRoute` la traduit en réponse.
// La forme reste compatible avec l'existant : `error` est TOUJOURS une chaîne
// (les écrans qui affichent `res.error` continuent de marcher), `code`,
// `fields` et `requestId` s'y ajoutent.
//
//   { error: string, code: AdminErrorCode, fields?: {…}, requestId: string }

export type AdminErrorCode =
  | 'validation'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'precondition'
  | 'rate_limited'
  | 'method_not_allowed'
  | 'service_unavailable'
  | 'internal';

export type AdminErrorBody = {
  error: string;
  code: AdminErrorCode;
  /** Message par champ (clé = chemin zod joint par `.`). */
  fields?: Record<string, string>;
  /** Raison métier fine d'un refus (`precondition`), stable et testable. */
  reason?: string;
  requestId?: string;
};

export class AdminError extends Error {
  readonly status: number;
  readonly code: AdminErrorCode;
  readonly fields?: Record<string, string>;
  readonly reason?: string;

  constructor(
    status: number,
    code: AdminErrorCode,
    message: string,
    extra: { fields?: Record<string, string>; reason?: string } = {}
  ) {
    super(message);
    this.name = 'AdminError';
    this.status = status;
    this.code = code;
    this.fields = extra.fields;
    this.reason = extra.reason;
  }

  toBody(requestId?: string): AdminErrorBody {
    return {
      error: this.message,
      code: this.code,
      ...(this.fields ? { fields: this.fields } : {}),
      ...(this.reason ? { reason: this.reason } : {}),
      ...(requestId ? { requestId } : {}),
    };
  }
}

/**
 * 400 et non 422 : c'est le code que renvoient aujourd'hui les routes admin
 * qui valident, et que les écrans attendent. Le `code: 'validation'` suffit à
 * le distinguer d'une autre erreur 400.
 */
export class ValidationError extends AdminError {
  constructor(message: string, fields?: Record<string, string>) {
    super(400, 'validation', message, { fields });
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AdminError {
  constructor(message = 'Introuvable.') {
    super(404, 'not_found', message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AdminError {
  constructor(message: string, reason?: string) {
    super(409, 'conflict', message, { reason });
    this.name = 'ConflictError';
  }
}

export class ForbiddenError extends AdminError {
  constructor(message = 'Accès refusé.') {
    super(403, 'forbidden', message);
    this.name = 'ForbiddenError';
  }
}

/**
 * L'état de l'objet interdit le geste (match déjà résolu, équipe désactivée…).
 * `reason` est un identifiant stable que le client peut traduire.
 */
export class PreconditionError extends AdminError {
  constructor(message: string, reason: string) {
    super(409, 'precondition', message, { reason });
    this.name = 'PreconditionError';
  }
}

/** Une dépendance (base, fournisseur) ne répond pas. */
export class ServiceUnavailableError extends AdminError {
  constructor(message = 'Service momentanément indisponible.') {
    super(503, 'service_unavailable', message);
    this.name = 'ServiceUnavailableError';
  }
}

const CODE_BY_STATUS: Record<number, AdminErrorCode> = {
  400: 'validation',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  405: 'method_not_allowed',
  409: 'conflict',
  429: 'rate_limited',
  502: 'service_unavailable',
  503: 'service_unavailable',
};

/**
 * Pont avec les utils historiques qui renvoient `{ ok: false, status, error }`
 * au lieu de lever : on garde leur statut, on type leur erreur.
 */
export function adminErrorFromStatus(
  status: number,
  message: string
): AdminError {
  return new AdminError(status, CODE_BY_STATUS[status] ?? 'internal', message);
}
