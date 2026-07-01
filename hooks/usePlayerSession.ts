// Auth bootstrap pour les pages /player.
//
// Historiquement chaque page /player répétait le même useEffect :
//   getSession → if !user redirect /login → setUser/setToken → loadData
//
// usePlayerSession expose un triple stable `{ user, token, loading, ready }` et
// pousse l'utilisateur vers `/login` (ou une cible configurable) dès qu'on sait
// qu'il est anonyme. Les pages branchent sur `ready` (auth résolue + user
// présent) pour charger leurs données ; le reste peut afficher un skeleton tant
// que `loading` est vrai.
//
// Depuis le refactor session partagée, l'auth vient de l'unique
// SessionProvider ; ce hook ne conserve que l'effet de redirection. API
// inchangée.

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from '@/hooks/useSession';
import type { User } from '@supabase/supabase-js';

export type PlayerSession = {
  user: User | null;
  token: string | null;
  loading: boolean;
  /** true when auth has resolved and a user is signed in. */
  ready: boolean;
};

type Options = {
  /** Where to send anonymous visitors. Defaults to /login. */
  redirectTo?: string;
  /** Disable the auto-redirect when no user is found (caller handles UX). */
  redirect?: boolean;
};

export function usePlayerSession(options: Options = {}): PlayerSession {
  const { redirectTo = '/login', redirect = true } = options;
  const router = useRouter();
  const { user, token, loading } = useSession();

  useEffect(() => {
    // On ne redirige qu'une fois l'auth résolue et l'utilisateur connu anonyme.
    if (loading) return;
    if (!user && redirect) {
      router.replace(redirectTo);
    }
  }, [loading, user, redirect, redirectTo, router]);

  return {
    user,
    token,
    loading,
    ready: !loading && !!user,
  };
}
