// features/admin/events/hooks/useDirectorWaveStationActions.ts — waves
// (CRUD, statut, reorder) et stations (CRUD, statut) du Director.
//
// Corps DÉPLACÉS À L'IDENTIQUE depuis pages/admin/events/[runId]/director.tsx
// (lot 9C) : seuls les accès à l'état et aux outils de la page deviennent des
// paramètres. La page reste propriétaire de tous les useState et du realtime.

import { useCallback } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import type { WaveFormPatch } from '@/components/admin/director/WaveBoard';
import type { StationFormPatch } from '@/components/admin/director/StationBoard';
import type {
  EventSegment,
  EventStation,
  EventStationStatus,
  EventWave,
  EventWaveStatus,
} from '@/types/events';
import type {
  AddToast,
  Confirm,
  DirectorDict,
  Mutation,
  Setter,
} from './directorHookTypes';

export type DirectorWaveStationActionsDeps = {
  t: DirectorDict;
  runId: string | null;
  waves: EventWave[];
  setWaves: Setter<EventWave[]>;
  setStations: Setter<EventStation[]>;
  setSegments: Setter<EventSegment[]>;
  setBusy: Setter<boolean>;
  mutate: Mutation['mutate'];
  mutateJson: Mutation['mutateJson'];
  regenerate: Mutation['regenerate'];
  confirm: Confirm;
  addToast: AddToast;
};

export function useDirectorWaveStationActions(
  deps: DirectorWaveStationActionsDeps
) {
  const {
    t,
    runId,
    waves,
    setWaves,
    setStations,
    setSegments,
    setBusy,
    mutate,
    mutateJson,
    regenerate,
    confirm,
    addToast,
  } = deps;

  /* -----------------------------------------------------------
   * Waves — CRUD + statut + reorder. Toutes les mutations regenerent la clef
   * d'idempotence (intentions distinctes) et maj l'etat local depuis la
   * reponse canonique de l'API.
   * ---------------------------------------------------------*/

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const handleCreateWave = useCallback(
    async (patch: WaveFormPatch) => {
      if (!runId) return;
      setBusy(true);
      regenerate();
      try {
        const json = await mutateJson<{ wave: EventWave }>(
          `/api/admin/events/${runId}/waves`,
          {
            method: 'POST',
            body: JSON.stringify({
              title: patch.title,
              planned_start_at: patch.planned_start_at,
              duration_min: patch.duration_min,
            }),
          }
        );
        setWaves((prev) => [...prev, json.wave].sort((a, b) => a.ord - b.ord));
        addToast(t.waveCreated, 'success');
      } catch (err) {
        addToast((err as Error)?.message ?? t.createFailed, 'error');
      } finally {
        setBusy(false);
      }
    },
    [runId, regenerate, mutateJson, addToast, t]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const handleUpdateWave = useCallback(
    async (waveId: string, patch: Partial<WaveFormPatch>) => {
      if (!runId) return;
      setBusy(true);
      regenerate();
      try {
        const json = await mutateJson<{ wave: EventWave }>(
          `/api/admin/events/${runId}/waves/${waveId}`,
          { method: 'PATCH', body: JSON.stringify(patch) }
        );
        setWaves((prev) =>
          prev
            .map((w) => (w.id === json.wave.id ? json.wave : w))
            .sort((a, b) => a.ord - b.ord)
        );
        addToast(t.waveUpdated, 'success');
      } catch (err) {
        addToast((err as Error)?.message ?? t.updateFailed, 'error');
      } finally {
        setBusy(false);
      }
    },
    [runId, regenerate, mutateJson, addToast, t]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const handleSetWaveStatus = useCallback(
    async (wave: EventWave, status: EventWaveStatus) => {
      if (!runId) return;
      if (status === 'skipped') {
        const ok = await confirm({
          title: format(t.confirmSkipWaveTitle, { title: wave.title }),
          subtitle: t.confirmSkipWaveSubtitle,
          variant: 'warning',
          confirmLabel: t.skipWaveLabel,
        });
        if (!ok) return;
      }
      setBusy(true);
      regenerate();
      try {
        const json = await mutateJson<{ wave: EventWave }>(
          `/api/admin/events/${runId}/waves/${wave.id}`,
          { method: 'PATCH', body: JSON.stringify({ status }) }
        );
        setWaves((prev) =>
          prev.map((w) => (w.id === json.wave.id ? json.wave : w))
        );
        addToast(t.waveStatusUpdated, 'success');
      } catch (err) {
        addToast((err as Error)?.message ?? t.statusChangeFailed, 'error');
      } finally {
        setBusy(false);
      }
    },
    [runId, confirm, regenerate, mutateJson, addToast, t]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const handleDeleteWave = useCallback(
    async (wave: EventWave) => {
      if (!runId) return;
      const ok = await confirm({
        title: format(t.confirmDeleteWaveTitle, { title: wave.title }),
        subtitle: t.confirmDeleteWaveSubtitle,
        variant: 'danger',
        confirmLabel: t.confirmDeleteLabel,
      });
      if (!ok) return;
      setBusy(true);
      regenerate();
      try {
        const res = await mutate(
          `/api/admin/events/${runId}/waves/${wave.id}`,
          {
            method: 'DELETE',
          }
        );
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(
            payload?.error ??
              format(t.deleteFailedStatus, { status: res.status })
          );
        }
        setWaves((prev) => prev.filter((w) => w.id !== wave.id));
        // Les segments rattaches ont wave_id remis a NULL cote DB (FK SET NULL).
        setSegments((prev) =>
          prev.map((s) => (s.wave_id === wave.id ? { ...s, wave_id: null } : s))
        );
        addToast(t.waveDeleted, 'success');
      } catch (err) {
        addToast((err as Error)?.message ?? t.deleteFailed, 'error');
      } finally {
        setBusy(false);
      }
    },
    [runId, confirm, regenerate, mutate, addToast, t]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const handleReorderWaves = useCallback(
    async (orderedIds: string[]) => {
      if (!runId) return;
      const prev = waves;
      // Optimistic : reassigne ord selon la nouvelle position.
      setWaves(() =>
        orderedIds
          .map((id, idx) => {
            const w = prev.find((x) => x.id === id);
            return w ? { ...w, ord: idx } : null;
          })
          .filter((w): w is EventWave => w !== null)
      );
      setBusy(true);
      regenerate();
      try {
        const json = await mutateJson<{ waves: EventWave[] }>(
          `/api/admin/events/${runId}/waves/reorder`,
          {
            method: 'POST',
            body: JSON.stringify({
              order: orderedIds.map((id, idx) => ({ id, ord: idx })),
            }),
          }
        );
        if (json.waves) setWaves(json.waves);
      } catch (err) {
        addToast((err as Error)?.message ?? t.reorderFailed, 'error');
        setWaves(prev);
      } finally {
        setBusy(false);
      }
    },
    [runId, waves, regenerate, mutateJson, addToast, t]
  );

  /* -----------------------------------------------------------
   * Stations — CRUD + statut.
   * ---------------------------------------------------------*/

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const handleCreateStation = useCallback(
    async (patch: StationFormPatch) => {
      if (!runId) return;
      setBusy(true);
      regenerate();
      try {
        const json = await mutateJson<{ station: EventStation }>(
          `/api/admin/events/${runId}/stations`,
          { method: 'POST', body: JSON.stringify(patch) }
        );
        setStations((prev) =>
          [...prev, json.station].sort((a, b) => a.ord - b.ord)
        );
        addToast(t.stationCreated, 'success');
      } catch (err) {
        addToast((err as Error)?.message ?? t.createFailed, 'error');
      } finally {
        setBusy(false);
      }
    },
    [runId, regenerate, mutateJson, addToast, t]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const handleUpdateStation = useCallback(
    async (stationId: string, patch: Partial<StationFormPatch>) => {
      if (!runId) return;
      setBusy(true);
      regenerate();
      try {
        const json = await mutateJson<{ station: EventStation }>(
          `/api/admin/events/${runId}/stations/${stationId}`,
          { method: 'PATCH', body: JSON.stringify(patch) }
        );
        setStations((prev) =>
          prev.map((s) => (s.id === json.station.id ? json.station : s))
        );
        addToast(t.stationUpdated, 'success');
      } catch (err) {
        addToast((err as Error)?.message ?? t.updateFailed, 'error');
      } finally {
        setBusy(false);
      }
    },
    [runId, regenerate, mutateJson, addToast, t]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const handleSetStationStatus = useCallback(
    async (station: EventStation, status: EventStationStatus) => {
      if (!runId) return;
      setBusy(true);
      regenerate();
      try {
        const json = await mutateJson<{ station: EventStation }>(
          `/api/admin/events/${runId}/stations/${station.id}`,
          { method: 'PATCH', body: JSON.stringify({ status }) }
        );
        setStations((prev) =>
          prev.map((s) => (s.id === json.station.id ? json.station : s))
        );
      } catch (err) {
        addToast((err as Error)?.message ?? t.statusChangeFailed, 'error');
      } finally {
        setBusy(false);
      }
    },
    [runId, regenerate, mutateJson, addToast, t]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const handleDeleteStation = useCallback(
    async (station: EventStation) => {
      if (!runId) return;
      const ok = await confirm({
        title: format(t.confirmDeleteStationTitle, { name: station.name }),
        subtitle: t.confirmDeleteStationSubtitle,
        variant: 'danger',
        confirmLabel: t.confirmDeleteLabel,
      });
      if (!ok) return;
      setBusy(true);
      regenerate();
      try {
        const res = await mutate(
          `/api/admin/events/${runId}/stations/${station.id}`,
          { method: 'DELETE' }
        );
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(
            payload?.error ??
              format(t.deleteFailedStatus, { status: res.status })
          );
        }
        setStations((prev) => prev.filter((s) => s.id !== station.id));
        setSegments((prev) =>
          prev.map((s) =>
            s.station_id === station.id ? { ...s, station_id: null } : s
          )
        );
        addToast(t.stationDeleted, 'success');
      } catch (err) {
        addToast((err as Error)?.message ?? t.deleteFailed, 'error');
      } finally {
        setBusy(false);
      }
    },
    [runId, confirm, regenerate, mutate, addToast, t]
  );

  return {
    handleCreateWave,
    handleUpdateWave,
    handleSetWaveStatus,
    handleDeleteWave,
    handleReorderWaves,
    handleCreateStation,
    handleUpdateStation,
    handleSetStationStatus,
    handleDeleteStation,
  };
}
