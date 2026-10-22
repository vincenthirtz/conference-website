// @vitest-environment happy-dom
//
// Women's Library, lot 16 — la saison du hall à son entrée
// (`ui/hall/useHallSeason.ts`) et ce qu'en fait l'écran d'une salle
// (`RoomStage`) : la saison est lue À LA DEMANDE (rien de l'événement dans le
// premier chargement), du même instant pour les citrouilles (`sceneOf`) et
// leur zone (`useRoomHotspots`) ; le fantôme est demandé au moteur dans le
// hall seulement (lui seul regarde l'affiche, à chaque image). La page de
// développement peut fixer l'instant (`?npc=halloween`) : le fantôme reste
// alors même hors de l'affiche.
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeEnterResponse } from '../../features/player/library/dev/fakeRealtime';
import { isHalloweenActive } from '../../features/player/library/halloween/event';
import { hallSeasonAt } from '../../features/player/library/halloween/hallDecor';
import { sceneOf } from '../../features/player/library/roomStageModel';
import { useHallSeason } from '../../features/player/library/ui/hall/useHallSeason';
import { roomHotspotsOf } from '../../features/player/library/ui/places/useRoomHotspots';
import nsHall from '../../lib/i18n/locales/fr/playerLibraryHall';

const t = nsHall.fr;
const IN_SEASON = Date.parse('2026-10-21T18:00:00+02:00');
const AFTER = Date.parse('2026-11-01T00:00:00+01:00');
const ENTERED = { room: 'x' };

afterEach(() => {
  vi.useRealTimers();
});

describe('useHallSeason', () => {
  it('le hall pendant l’événement : la saison arrive, le fantôme est demandé', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(IN_SEASON);
    const { result } = renderHook(() => useHallSeason('hall', ENTERED));
    expect(result.current.at).toBe(IN_SEASON);
    expect(result.current.npc).toEqual({
      kind: 'halloween',
      spotId: 'halloween',
      booText: t.halloween.boo,
      label: t.halloween.ghostLabel,
    });
    await waitFor(() => expect(result.current.season).not.toBeNull());
    expect(result.current.season?.items.map((i) => i.key)).toEqual([
      'pumpkin_pile',
      'jack_o_lantern',
    ]);
  });

  it('après l’affiche : pas de saison (le fantôme, lui, ne se montrera pas)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AFTER);
    const { result } = renderHook(() => useHallSeason('hall', ENTERED));
    // Le moteur regarde l'affiche lui-même : on lui demande le PNJ du hall.
    expect(result.current.npc?.ignoreWindow).toBeUndefined();
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.season).toBeNull();
  });

  it('ailleurs ou avant l’entrée : ni saison ni fantôme', () => {
    const reading = renderHook(() => useHallSeason('reading_room', ENTERED));
    expect(reading.result.current.npc).toBeNull();
    expect(reading.result.current.season).toBeNull();
    const before = renderHook(() => useHallSeason('hall', null)).result.current;
    expect(before).toEqual({ at: null, season: null, npc: null });
  });

  it('une nouvelle entrée relit l’heure ; pas un nouveau rendu', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(IN_SEASON);
    const { result, rerender } = renderHook(
      ({ e }: { e: object }) => useHallSeason('hall', e),
      { initialProps: { e: ENTERED } }
    );
    vi.setSystemTime(IN_SEASON + 5_000);
    rerender({ e: ENTERED });
    expect(result.current.at).toBe(IN_SEASON);
    rerender({ e: { room: 'y' } });
    expect(result.current.at).toBe(IN_SEASON + 5_000);
  });

  it('développement (`?npc=halloween`) : l’instant fixé, le fantôme gardé', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AFTER + 86_400_000);
    const at = Date.parse('2026-10-30T20:00:00+01:00');
    expect(isHalloweenActive(at)).toBe(true);
    const { result } = renderHook(() => useHallSeason('hall', ENTERED, at));
    expect(result.current.at).toBe(at);
    expect(result.current.npc?.ignoreWindow).toBe(true);
    await waitFor(() => expect(result.current.season).not.toBeNull());
  });
});

describe('un résultat pour la citrouille et sa zone', () => {
  it('pendant : les deux ; après : aucune', () => {
    const enter = fakeEnterResponse('hall');
    for (const [at, on] of [
      [IN_SEASON, true],
      [AFTER, false],
    ] as const) {
      const season = hallSeasonAt(at);
      const keys = sceneOf(enter, season?.items).items.map((i) => i.key);
      const spots = roomHotspotsOf('hall', t.spots, vi.fn(), season).hotspots;
      expect(keys.includes('pumpkin_pile')).toBe(on);
      expect(keys.includes('jack_o_lantern')).toBe(on);
      expect(spots.some((h) => h.id === 'halloween')).toBe(on);
    }
    // Sans saison : le décor de base.
    expect(sceneOf(enter).items.map((i) => i.key)).not.toContain(
      'pumpkin_pile'
    );
  });
});
