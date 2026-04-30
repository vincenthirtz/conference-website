// Lightweight Supabase auth subscription. Tells the UI whether someone is
// signed in (any role) without going through the staff cache. Use this for
// nav-level affordances (notification bell, "my space" link).

import { useEffect, useState } from 'react';
import { supabaseClient } from '@/utils/supabase';
import type { User } from '@supabase/supabase-js';

export type AuthSession = {
  user: User | null;
  loading: boolean;
};

export function useAuthSession(): AuthSession {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabaseClient.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabaseClient.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;
        setUser(session?.user ?? null);
      }
    );
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}
