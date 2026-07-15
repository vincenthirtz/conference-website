// hooks/useCueStream.ts
//
// Feature: Run-of-show — Lot 5 + post-lot 6 realtime upgrade.
// Hook qui consomme les cues du run live courant pour le Cockpit caster.
//
// Strategy (post add_caster_realtime_select_policies migration) :
//   - Supabase Realtime subscription sur event_cues filter event_run_id : a
//     chaque INSERT/UPDATE/DELETE on declenche un tick immediat (latence ~100ms
//     au lieu de 3s).
//   - Polling fallback toutes les 30s (visibility-gated) : couvre le cas ou la
//     subscription saute (network glitch, navigateur backgrounded prolonge).
//   - Le tick fait toujours un fetch REST /api/caster/runs/[runId]/cues?since=
//     pour hydrater acked_by_me et garder une logique simple (le payload
//     realtime contient la row brute mais pas l etat ack du caster courant).
//
// Contrats :
//   - Premiere fetch sans `since` (limit 20) pour seed.
//   - Fetchs suivantes avec ?since=<lastCreatedAt> pour minimiser le payload.
//   - Merge dedupe par id, garde les 50 plus recents.
//   - pendingUrgent = cue urgent FIFO non-acked (le plus ancien d'abord).
//   - ack(cueId) : POST + optimistic update + rollback en cas d erreur.
//
// API public : { cues, pendingUrgent, ack, error }

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { logger } from '@/utils/logger';
import { useRealtimeChannel } from './useRealtimeChannel';
import type { EventCue } from '@/types/events';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// Poll lent : safety-net si le canal realtime saute. Le realtime est la source
// principale, donc on peut se permettre 30s sans degrader l UX.
const POLL_INTERVAL_MS = 30_000;
const SEED_LIMIT = 20;
const MAX_KEPT = 50;

export type CueWithAck = EventCue & { acked_by_me: boolean };

type UseCueStreamParams = {
  runId: string | null;
  accessToken: string | null;
};

export type UseCueStreamApi = {
  cues: CueWithAck[];
  pendingUrgent: CueWithAck | null;
  ack: (cueId: string) => Promise<void>;
  error: string | null;
};

type CuesResponse = {
  cues: CueWithAck[];
};

type AckResponse = {
  ack: { cue_id: string; cast_member_id: string; acked_at: string };
  alreadyAcked: boolean;
};

function dedupeAndSort(merged: CueWithAck[]): CueWithAck[] {
  const map = new Map<string, CueWithAck>();
  for (const c of merged) {
    const existing = map.get(c.id);
    if (!existing) {
      map.set(c.id, c);
      continue;
    }
    // Si on a deja une version + recente d acked_by_me=true, on la garde.
    map.set(c.id, {
      ...existing,
      ...c,
      acked_by_me: existing.acked_by_me || c.acked_by_me,
    });
  }
  // Tri DESC (plus recent en premier).
  return Array.from(map.values())
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, MAX_KEPT);
}

export function useCueStream({
  runId,
  accessToken,
}: UseCueStreamParams): UseCueStreamApi {
  const [cues, setCues] = useState<CueWithAck[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Refs pour la stabilite du polling.
  const tokenRef = useRef<string | null>(accessToken);
  const runIdRef = useRef<string | null>(runId);
  const sinceRef = useRef<string | null>(null);
  const cuesRef = useRef<CueWithAck[]>([]);

  useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);

  // Reset interne quand le runId change.
  useEffect(() => {
    runIdRef.current = runId;
    sinceRef.current = null;
    cuesRef.current = [];
    setCues([]);
    setError(null);
  }, [runId]);

  // Wake-up handle exposé pour la subscription realtime ci-dessous.
  const tickRef = useRef<() => void>(() => undefined);

  // Polling fallback + tick on-demand.
  useEffect(() => {
    if (!accessToken || !runId) return undefined;

    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      const token = tokenRef.current;
      const currentRunId = runIdRef.current;
      if (!token || !currentRunId) return;
      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      ) {
        return;
      }

      try {
        const url = new URL(
          `/api/caster/runs/${currentRunId}/cues`,
          typeof window !== 'undefined'
            ? window.location.origin
            : 'http://localhost'
        );
        if (sinceRef.current) {
          url.searchParams.set('since', sinceRef.current);
        } else {
          url.searchParams.set('limit', String(SEED_LIMIT));
        }
        const res = await fetch(url.toString().replace(url.origin, ''), {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401 || res.status === 403) {
          // useCasterSession gere le reauth.
          return;
        }
        if (res.status === 409) {
          // Run pas live — on stop le seed mais on garde l etat local.
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error || `HTTP ${res.status}`);
        }

        const json = (await res.json()) as CuesResponse;
        const incoming = Array.isArray(json.cues) ? json.cues : [];

        if (incoming.length > 0) {
          // Avance le curseur sur le plus recent recu (l API tri DESC, donc
          // c est incoming[0]).
          sinceRef.current = incoming[0].created_at;
        } else if (!sinceRef.current) {
          // Premiere fetch vide : on initialise le since a maintenant pour
          // n attraper que les futurs cues (la limite 20 de seed n a rien
          // ramene de toute facon).
          sinceRef.current = new Date().toISOString();
        }

        const merged = dedupeAndSort([...cuesRef.current, ...incoming]);
        cuesRef.current = merged;
        setCues(merged);
        setError(null);
      } catch (err) {
        logger.error('[cockpit-cues] poll error', err);
        if (!cancelled) {
          setError((err as Error)?.message || 'Polling cues echoue.');
        }
      }
    }

    // Expose tick a la subscription realtime (wake-up immediat sur INSERT).
    tickRef.current = () => {
      void tick();
    };

    // Premier appel immediat puis interval fallback.
    tick();
    const handle = setInterval(tick, POLL_INTERVAL_MS);

    function onVisibility() {
      if (document.visibilityState === 'visible') tick();
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      cancelled = true;
      clearInterval(handle);
      tickRef.current = () => undefined;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [accessToken, runId]);

  // Realtime event_cues : on traite le payload DIRECTEMENT selon l'evenement.
  // La policy SELECT (add_caster_realtime_select_policies) autorise le caster
  // authentifie a recevoir les rows de son tenant.
  //   - INSERT : la nouvelle row a created_at > curseur → un tick REST la
  //     recupere avec acked_by_me correctement hydrate (false a la creation).
  //   - UPDATE / DELETE : le refetch REST est AVEUGLE ici — l'API filtre en
  //     created_at > since (strict), donc une row deja vue (editee ou
  //     supprimee) n'est jamais reramenee. On applique donc le payload en
  //     local. Sans ca : une correction de texte reste invisible, et un cue
  //     urgent supprime par le Director laisse la UrgentCueModal bloquee sur
  //     un cue fantome que le caster est force d'acker.
  const applyCueRow = useCallback(
    (row: Partial<EventCue> & { id?: string }) => {
      if (!row.id) return;
      const idx = cuesRef.current.findIndex((c) => c.id === row.id);
      // Inconnu en local (jamais seed) → on laisse le tick INSERT l'hydrater.
      if (idx === -1) return;
      const next = [...cuesRef.current];
      next[idx] = {
        ...next[idx],
        ...(row as EventCue),
        // acked_by_me est un etat par-caster absent du payload realtime : on
        // preserve la valeur locale plutot que de l'ecraser a undefined.
        acked_by_me: next[idx].acked_by_me,
      };
      cuesRef.current = next;
      setCues(next);
    },
    []
  );

  const removeCue = useCallback((id: string) => {
    if (!cuesRef.current.some((c) => c.id === id)) return;
    const next = cuesRef.current.filter((c) => c.id !== id);
    cuesRef.current = next;
    setCues(next);
  }, []);

  const onCueRealtimeChange = useCallback(
    (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      if (payload.eventType === 'DELETE') {
        // payload.old ne porte que la PK (replica identity default) — l'id
        // suffit pour retirer le cue.
        const old = payload.old as { id?: string };
        if (old?.id) removeCue(old.id);
        return;
      }
      if (payload.eventType === 'UPDATE') {
        const row = payload.new as Partial<EventCue> & { id?: string };
        if (row?.id) applyCueRow(row);
        return;
      }
      // INSERT (ou fallback) : refetch REST pour hydrater acked_by_me.
      tickRef.current();
    },
    [applyCueRow, removeCue]
  );

  // event_cue_acks : ack depuis un autre device/onglet → refetch REST pour
  // rafraichir acked_by_me (limite a la fenetre du curseur `since`).
  const onAckRealtimeChange = useCallback(() => {
    tickRef.current();
  }, []);

  useRealtimeChannel({
    enabled: !!runId && !!accessToken,
    channel: `cockpit-cues-${runId ?? 'none'}`,
    table: 'event_cues',
    filter: runId ? `event_run_id=eq.${runId}` : undefined,
    onChange: onCueRealtimeChange,
  });

  // Subscription complementaire sur event_cue_acks : si le caster ack depuis
  // un autre device/onglet, on recupere l'etat acked_by_me a jour.
  useRealtimeChannel({
    enabled: !!runId && !!accessToken,
    channel: `cockpit-cue-acks-${runId ?? 'none'}`,
    table: 'event_cue_acks',
    onChange: onAckRealtimeChange,
  });

  const ack = useCallback(
    async (cueId: string) => {
      const token = tokenRef.current;
      if (!token) {
        setError('Session expiree, reconnecte-toi.');
        return;
      }

      // Optimistic update.
      const previous = cuesRef.current;
      const optimistic = previous.map((c) =>
        c.id === cueId ? { ...c, acked_by_me: true } : c
      );
      cuesRef.current = optimistic;
      setCues(optimistic);

      try {
        const res = await fetch(`/api/caster/cues/${cueId}/ack`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error || `HTTP ${res.status}`);
        }
        // Reponse OK : on confirme l optimistic update.
        (await res.json().catch(() => null)) as AckResponse | null;
        setError(null);
      } catch (err) {
        logger.error('[cockpit-cues] ack error', err);
        // Rollback.
        cuesRef.current = previous;
        setCues(previous);
        const msg = (err as Error)?.message || 'Ack echoue.';
        setError(msg);
        throw err;
      }
    },
    []
  );

  const pendingUrgent = useMemo<CueWithAck | null>(() => {
    if (cues.length === 0) return null;
    // FIFO sur urgents non-acked et NON rétractés : on prend le plus ancien.
    // Un cue rétracté par le Director (retracted_at set, recu via realtime
    // UPDATE) sort d'ici → la UrgentCueModal se ferme automatiquement.
    const urgents = cues.filter(
      (c) => c.severity === 'urgent' && !c.acked_by_me && !c.retracted_at
    );
    if (urgents.length === 0) return null;
    return urgents.reduce((oldest, c) =>
      c.created_at < oldest.created_at ? c : oldest
    );
  }, [cues]);

  return { cues, pendingUrgent, ack, error };
}
