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

import { useCallback, useState } from 'react';
import { useRealtimeChannel } from './useRealtimeChannel';
import type {
  EventRun,
  EventSegment,
  EventStation,
  EventWave,
} from '@/types/events';

type ChangeType = 'INSERT' | 'UPDATE' | 'DELETE';

type Options = {
  enabled?: boolean;
  runId: string | null;
  /**
   * Donne au hook l'etat courant pour qu'il puisse merger les payloads
   * realtime sans reset complet. On passe les setters typiquement.
   */
  onSegmentChange: (
    eventType: ChangeType,
    segment: Partial<EventSegment> & { id?: string }
  ) => void;
  onRunChange: (run: Partial<EventRun> & { id?: string }) => void;
  /**
   * Optionnels — feature Waves + Stations. Si fournis, le hook s'abonne aussi
   * aux tables event_waves / event_stations (filtre event_run_id). Si absents,
   * aucune souscription supplementaire (le parent garde son fallback refetch).
   */
  onWaveChange?: (
    eventType: ChangeType,
    wave: Partial<EventWave> & { id?: string }
  ) => void;
  onStationChange?: (
    eventType: ChangeType,
    station: Partial<EventStation> & { id?: string }
  ) => void;
};

export function useEventRunRealtime({
  enabled = true,
  runId,
  onSegmentChange,
  onRunChange,
  onWaveChange,
  onStationChange,
}: Options): { connected: boolean } {
  const isEnabled = enabled && !!runId;

  // Statut des deux canaux principaux (segments + run) pour exposer un
  // indicateur temps-reel / mode degrade a l'UI. connected = les deux
  // SUBSCRIBED. Les canaux waves/stations (optionnels) ne comptent pas : ils
  // ne sont pas toujours actifs.
  const [segStatus, setSegStatus] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const handleSegStatus = useCallback((s: string) => setSegStatus(s), []);
  const handleRunStatus = useCallback((s: string) => setRunStatus(s), []);

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

  const handleWaves = useCallback(
    (payload: {
      eventType: string;
      new: Record<string, unknown>;
      old: Record<string, unknown>;
    }) => {
      if (!onWaveChange) return;
      const type = payload.eventType as ChangeType;
      if (type === 'DELETE') {
        const old = payload.old as Partial<EventWave> & { id?: string };
        if (old?.id) onWaveChange('DELETE', { id: old.id });
        return;
      }
      const row = payload.new as Partial<EventWave> & { id?: string };
      if (row?.id) onWaveChange(type, row);
    },
    [onWaveChange]
  );

  const handleStations = useCallback(
    (payload: {
      eventType: string;
      new: Record<string, unknown>;
      old: Record<string, unknown>;
    }) => {
      if (!onStationChange) return;
      const type = payload.eventType as ChangeType;
      if (type === 'DELETE') {
        const old = payload.old as Partial<EventStation> & { id?: string };
        if (old?.id) onStationChange('DELETE', { id: old.id });
        return;
      }
      const row = payload.new as Partial<EventStation> & { id?: string };
      if (row?.id) onStationChange(type, row);
    },
    [onStationChange]
  );

  useRealtimeChannel({
    enabled: isEnabled,
    channel: `event-segments-${runId ?? 'none'}`,
    table: 'event_segments',
    filter: runId ? `event_run_id=eq.${runId}` : undefined,
    onChange: handleSegments,
    onStatus: handleSegStatus,
  });

  useRealtimeChannel({
    enabled: isEnabled,
    channel: `event-run-${runId ?? 'none'}`,
    table: 'event_runs',
    filter: runId ? `id=eq.${runId}` : undefined,
    onChange: handleRun,
    onStatus: handleRunStatus,
  });

  useRealtimeChannel({
    enabled: isEnabled && !!onWaveChange,
    channel: `event-waves-${runId ?? 'none'}`,
    table: 'event_waves',
    filter: runId ? `event_run_id=eq.${runId}` : undefined,
    onChange: handleWaves,
  });

  useRealtimeChannel({
    enabled: isEnabled && !!onStationChange,
    channel: `event-stations-${runId ?? 'none'}`,
    table: 'event_stations',
    filter: runId ? `event_run_id=eq.${runId}` : undefined,
    onChange: handleStations,
  });

  // connected = les deux canaux principaux SUBSCRIBED. Guarde par isEnabled
  // pour ne pas rester "connecte" sur un statut perime quand le hook est off.
  const connected =
    isEnabled && segStatus === 'SUBSCRIBED' && runStatus === 'SUBSCRIBED';

  return { connected };
}
