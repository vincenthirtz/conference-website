// Unique souscription à la session Supabase pour tout l'arbre React.
//
// Avant ce provider, chaque hook d'auth (useAuthSession, usePlayerSession,
// useStaffSession) ouvrait SA propre paire getSession + onAuthStateChange. Sur
// une page donnée on cumulait 3 à 5 souscriptions redondantes (navbar +
// PublicNav + PlayerBell + la page elle-même). Ici : un seul getSession et un
// seul listener, dont l'état est partagé via contexte. Les hooks historiques
// ne sont plus que des sélecteurs sur ce contexte — leur API publique est
// inchangée.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { supabaseClient } from '@/utils/supabase';
import type { AuthChangeEvent, User } from '@supabase/supabase-js';

export type SessionState = {
  user: User | null;
  token: string | null;
  loading: boolean;
  /** Dernier événement d'auth Supabase (null avant la résolution initiale). */
  lastEvent: AuthChangeEvent | null;
};

// Défaut volontairement non-throwing : un hook consommé hors provider (pages
// `embed` bare, tests unitaires) voit simplement un état « anonyme + en cours
// de chargement », ce qui correspond au comportement pré-refactor.
const DEFAULT_STATE: SessionState = {
  user: null,
  token: null,
  loading: true,
  lastEvent: null,
};

const SessionContext = createContext<SessionState>(DEFAULT_STATE);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(DEFAULT_STATE);

  useEffect(() => {
    let mounted = true;

    supabaseClient.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setState((prev) => ({
        user: data.session?.user ?? null,
        token: data.session?.access_token ?? null,
        loading: false,
        // Ne pas rétrograder un event déjà reçu du listener (course possible
        // entre getSession et le premier onAuthStateChange).
        lastEvent: prev.lastEvent ?? 'INITIAL_SESSION',
      }));
    });

    const { data: sub } = supabaseClient.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        setState({
          user: session?.user ?? null,
          token: session?.access_token ?? null,
          loading: false,
          lastEvent: event,
        });
      }
    );

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <SessionContext.Provider value={state}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}
