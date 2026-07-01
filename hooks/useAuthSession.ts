// Lightweight Supabase auth selector. Tells the UI whether someone is
// signed in (any role) without going through the staff cache. Use this for
// nav-level affordances (notification bell, "my space" link).
//
// Depuis le refactor session partagée, ce hook ne fait plus sa propre
// souscription : il lit l'unique SessionProvider. API inchangée.

import { useSession } from '@/hooks/useSession';
import type { User } from '@supabase/supabase-js';

export type AuthSession = {
  user: User | null;
  loading: boolean;
};

export function useAuthSession(): AuthSession {
  const { user, loading } = useSession();
  return { user, loading };
}
