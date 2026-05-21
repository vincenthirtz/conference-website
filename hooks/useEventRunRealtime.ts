// hooks/useEventRunRealtime.ts
//
// Realtime helper pour la page Director.
//
// Subscribe a deux canaux Supabase postgres_changes :
//   - event_segments filtre `event_run_id=eq.<runId>`
//   - event_runs filtre `id=eq.<runId>`
//
// On filtre cote serveur sur l'id du run (pas sur tenant_id) car :
//   - l'id du run est deja unique cross-tenant (uuid),
//   - le SSR loader a deja verifie tenant ownership,
//   - filtrer sur tenant_id seul donnerait tous les segments du tenant
//     (overkill quand on regarde un run precis).
//
// Le hook merge les changements dans des etats locaux : segments[] et le run
// lui-meme. Les callbacks `onSegmentsChange` / `onRunChange` sont appeles
// avec les nouvelles valeurs, ce qui permet au composant parent de garder le
// controle de la source de verite (utile si on veut aussi refetch en filet de
// securite).

import { useCallback } from 'react';
import { useRealtimeChannel } from './useRealtimeChannel';
import type { EventRun, EventSegment } from '@/types/events';

type Options = {
  enabled?: boolean;
  runId: string | null;
  /**
   * Donne au hook l'etat courant pour qu'il puisse merger les payloads
   * realtime sans reset complet. On passe les setters typiquement.
   */
  onSegmentChange: (
    eventType: 'INSERT' | 'UPDATE' | 'DELETE',
    segment: Partial<EventSegment> & { id?: string }
  ) => void;
  onRunChange: (run: Partial<EventRun> & { id?: string }) => void;
};

export function useEventRunRealtime({
  enabled = true,
  runId,
  onSegmentChange,
  onRunChange,
}: Options) {
  const isEnabled = enabled && !!runId;

  const handleSegments = useCallback(
    (payload: {
      eventType: string;
      new: Record<string, unknown>;
      old: Record<string, unknown>;
    }) => {
      const type = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
      if (type === 'DELETE') {
        const old = payload.old as Partial<EventSegment> & { id?: string };
        if (old?.id) onSegmentChange('DELETE', { id: old.id });
        return;
      }
      const row = payload.new as Partial<EventSegment> & { id?: string };
      if (row?.id) onSegmentChange(type, row);
    },
    [onSegmentChange]
  );

  const handleRun = useCallback(
    (payload: {
      eventType: string;
      new: Record<string, unknown>;
      old: Record<string, unknown>;
    }) => {
      const type = payload.eventType;
      if (type === 'DELETE') return; // le run est en cours d'edition, pas pertinent
      const row = payload.new as Partial<EventRun> & { id?: string };
      if (row?.id) onRunChange(row);
    },
    [onRunChange]
  );

  useRealtimeChannel({
    enabled: isEnabled,
    channel: `event-segments-${runId ?? 'none'}`,
    table: 'event_segments',
    filter: runId ? `event_run_id=eq.${runId}` : undefined,
    onChange: handleSegments,
  });

  useRealtimeChannel({
    enabled: isEnabled,
    channel: `event-run-${runId ?? 'none'}`,
    table: 'event_runs',
    filter: runId ? `id=eq.${runId}` : undefined,
    onChange: handleRun,
  });
}
