// features/admin/_shared/serverErrorText.ts — texte d'erreur d'une requête
// admin, pour les écrans qui affichaient `json.error || <libellé>` (L10).
//
// Une réponse HTTP en erreur donne son corps `error` (vide s'il n'y en a
// pas : l'écran retombe sur son libellé) ; une autre exception (coupure
// réseau, session manquante) donne son message.

import { AdminHttpError } from '@/utils/admin/adminHttp';

export function serverErrorText(err: unknown): string {
  if (err instanceof AdminHttpError) {
    const body = err.payload as { error?: unknown } | null;
    return typeof body?.error === 'string' ? body.error : '';
  }
  return (err as Error)?.message ?? '';
}
