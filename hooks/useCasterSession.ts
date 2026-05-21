// hooks/useCasterSession.ts
//
// Feature: Run-of-show — Lot 4.
// Hook React qui combine :
//   - la session supabase (auth.users)
//   - le profil caster enrichi via /api/caster/me (cast_members + assignations)
//
// Etats :
//   - loading=true : check en cours
//   - error='unauthenticated' : pas de session supabase
//   - error='not_caster' : session valide mais pas de cast_members actif lie
//   - error='network' : panne reseau / 5xx
//   - caster!=null : session valide ET caster lie
//
// Le hook NE redirige PAS automatiquement. C est au composant page de decider
// (afficher un message, rediriger vers /caster/login, etc.).

import { useCallback, useEffect, useState } from 'react';
import { supabaseClient } from '@/utils/supabase';
import { logger } from '@/utils/logger';

export type CasterProfile = {
  id: string;
  name: string;
  title: string | null;
  imageUrl: string | null;
  twitchUrl: string | null;
  city: string | null;
};

export type CasterUpcomingAssignment = {
  assignmentId: string;
  role: string | null;
  match: {
    id: string;
    scheduledAt: string | null;
    status: string;
    matchFormat: string | null;
    roundName: string | null;
    streamUrl: string | null;
    lobbyCode: string | null;
    team1: {
      id: string;
      name: string;
      shortName: string | null;
      logoUrl: string | null;
    } | null;
    team2: {
      id: string;
      name: string;
      shortName: string | null;
      logoUrl: string | null;
    } | null;
    tournament: {
      id: string;
      name: string;
      slug: string;
    } | null;
  };
};

export type CasterMeResponse = {
  caster: CasterProfile;
  upcomingAssignments: CasterUpcomingAssignment[];
};

export type CasterSessionError = 'unauthenticated' | 'not_caster' | 'network';

export type UseCasterSessionApi = {
  caster: CasterProfile | null;
  upcomingAssignments: CasterUpcomingAssignment[];
  loading: boolean;
  error: CasterSessionError | null;
  accessToken: string | null;
  /** Re-fetch /api/caster/me to refresh upcoming assignments. */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

export function useCasterSession(): UseCasterSessionApi {
  const [caster, setCaster] = useState<CasterProfile | null>(null);
  const [upcoming, setUpcoming] = useState<CasterUpcomingAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<CasterSessionError | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token ?? null;
      if (!token) {
        setCaster(null);
        setUpcoming([]);
        setAccessToken(null);
        setError('unauthenticated');
        return;
      }
      setAccessToken(token);

      const res = await fetch('/api/caster/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) {
        setCaster(null);
        setUpcoming([]);
        setError('not_caster');
        return;
      }
      if (!res.ok) {
        setError('network');
        return;
      }
      const json = (await res.json()) as CasterMeResponse;
      setCaster(json.caster);
      setUpcoming(json.upcomingAssignments ?? []);
      setError(null);
    } catch (err) {
      logger.error('[useCasterSession] error', err);
      setError('network');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    load();
    // S abonne aux changements de session (logout d un autre tab, etc.).
    const { data: sub } = supabaseClient.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        load();
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [load]);

  const signOut = useCallback(async () => {
    await supabaseClient.auth.signOut();
    setCaster(null);
    setUpcoming([]);
    setAccessToken(null);
    setError('unauthenticated');
  }, []);

  return {
    caster,
    upcomingAssignments: upcoming,
    loading,
    error,
    accessToken,
    refresh: load,
    signOut,
  };
}
