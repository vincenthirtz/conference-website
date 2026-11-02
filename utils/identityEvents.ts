// utils/identityEvents.ts — les changements de session côté Better Auth, sous la forme de
// `onAuthStateChange` de Supabase.
//
// À part de l'adaptateur (utils/identityBrowserBetterAuth.ts), qui n'est chargé qu'au besoin :
// `onAuthStateChange` doit s'abonner tout de suite, sans attendre ce chargement.

import type { Session } from '@supabase/supabase-js';

export type IdentityEvent =
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED';

type Listener = (event: IdentityEvent, session: Session | null) => void;

const listeners = new Set<Listener>();

export function onIdentityEvent(callback: Listener) {
  listeners.add(callback);
  return {
    data: {
      subscription: {
        id: 'better-auth',
        callback,
        unsubscribe: () => {
          listeners.delete(callback);
        },
      },
    },
  };
}

export function emitIdentityEvent(
  event: IdentityEvent,
  session: Session | null
): void {
  for (const listener of listeners) listener(event, session);
}

export function hasIdentityListeners(): boolean {
  return listeners.size > 0;
}
