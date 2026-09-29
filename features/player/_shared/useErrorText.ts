// features/player/_shared/useErrorText.ts — le résolveur de messages
// d'erreur joueuse, branché sur la locale courante (lots P4 → P6).
//
//   const errorText = usePlayerErrorText();
//   addToast(errorText(err, t.saveError), 'error');
//
// Et pour un formulaire : `useSchemaForm({ …, describeError: errorText })` —
// l'erreur non rattachée à un champ s'affiche traduite par son `code`.

import { useCallback } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsPlayerErrors from '@/lib/i18n/locales/fr/playerErrors';
import { playerErrorText } from './errorMessage';

export function usePlayerErrorText(): (
  err: unknown,
  fallback: string
) => string {
  const messages = useT(nsPlayerErrors);
  return useCallback(
    (err: unknown, fallback: string) =>
      playerErrorText(err, messages, fallback),
    [messages]
  );
}
