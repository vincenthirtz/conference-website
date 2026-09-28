// components/admin/broadcast/twitchPanelUtils.tsx
//
// Les briques communes aux panneaux Twitch de la régie (commandes,
// prédictions, chat) — recopiées mot pour mot dans chacun d'eux jusqu'ici.
// Une copie corrigée ici ne l'était pas là ; et le panneau des commandes est
// gelé en taille, chaque ligne rendue lui redonne de la marge.

import { useCallback, useState } from 'react';
import { AdminFetchError } from '@/hooks/useAdminFetch';

/** Le `code` machine d'une AdminFetchError (`payload.code`), sinon `null`. */
export function adminErrorCode(err: unknown): string | null {
  if (
    err instanceof AdminFetchError &&
    err.payload &&
    typeof err.payload === 'object'
  ) {
    const c = (err.payload as { code?: unknown }).code;
    if (typeof c === 'string') return c;
  }
  return null;
}

/**
 * « Occupé » CIBLÉ par action (`create`, `lock`, `resolve:<id>`…) : un appel
 * en vol ne gèle que son bouton, et un second clic sur la même action est
 * ignoré tant que le premier n'a pas répondu.
 */
export function useBusySet(): {
  isBusy: (id: string) => boolean;
  withBusy: <T>(id: string, fn: () => Promise<T>) => Promise<T | undefined>;
} {
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const isBusy = useCallback((id: string) => busy.has(id), [busy]);
  const withBusy = useCallback(
    async <T,>(id: string, fn: () => Promise<T>): Promise<T | undefined> => {
      if (busy.has(id)) return undefined;
      setBusy((prev) => new Set(prev).add(id));
      try {
        return await fn();
      } finally {
        setBusy((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [busy]
  );
  return { isBusy, withBusy };
}

export function Spinner() {
  return (
    <span className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" />
  );
}
