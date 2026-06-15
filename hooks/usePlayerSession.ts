// Centralised auth bootstrap for /player pages.
//
// Every player page used to repeat the same useEffect:
//   getSession → if !user redirect /login → setUser/setToken → loadData
//
// usePlayerSession returns a stable `{ user, token, loading, ready }` triple
// and pushes the user toward `/login` (or a configurable redirect) as
// soon as we know they're anonymous. Pages should branch on `ready` (auth
// resolved + user present) to load data; the rest of the page can render
// a skeleton while loading is true.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabaseClient } from '@/utils/supabase';
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
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const apply = (next: { user: User | null; token: string | null }) => {
      if (!mounted) return;
      setUser(next.user);
      setToken(next.token);
      setLoading(false);
      if (!next.user && redirect) {
        router.replace(redirectTo);
      }
    };

    supabaseClient.auth.getSession().then(({ data }) => {
      apply({
        user: data.session?.user ?? null,
        token: data.session?.access_token ?? null,
      });
    });

    const { data: sub } = supabaseClient.auth.onAuthStateChange(
      (_event, session) => {
        apply({
          user: session?.user ?? null,
          token: session?.access_token ?? null,
        });
      }
    );

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // We intentionally re-run when the redirect target changes; router is
    // stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirectTo, redirect]);

  return {
    user,
    token,
    loading,
    ready: !loading && !!user,
  };
}
