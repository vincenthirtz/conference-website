// tests/unit/__helpers__/failTable.ts
//
// Fait échouer TOUTE lecture d'une table du mock Supabase (`supabaseAdmin`) :
// la requête chaînée se résout en `{ data: null, error }`. Sert à vérifier
// qu'une erreur de lecture donne un 500 et jamais une décision par défaut
// (« pas le droit » = faux 403). Rendre le spy via `mockRestore()`.

import { vi } from 'vitest';
import { supabaseAdmin } from './supabaseMock';

export function failTable(table: string, message = 'boom') {
  const original = supabaseAdmin.from.bind(supabaseAdmin);
  const result = { data: null, error: { message } };
  const failing: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown) => resolve(result);
        }
        return () => failing;
      },
    }
  );
  return vi
    .spyOn(supabaseAdmin, 'from')
    .mockImplementation(((name: string) =>
      name === table ? failing : original(name)) as typeof supabaseAdmin.from);
}
