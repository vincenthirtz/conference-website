// @vitest-environment happy-dom
//
// Women's Library, lot 5 — le hook `useLibraryRoomChannel` (entrer dans une
// salle et y voir les autres), contre le Realtime EN MÉMOIRE et un client
// HTTP injecté (les routes sont testées dans conference-api).
//   * entrer → `connecting` → `connected`, les autres apparaissent ;
//   * un refus de l'API (`PlayerHttpError`) → `refused`, avec son `code` et
//     son `until` ; une autre panne → `enter_failed` ;
//   * une éviction serveur → `evicted`, le rappel `onEvicted` ;
//   * démonter ferme les canaux.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { PlayerHttpError } from '../../utils/player/playerHttp';
import { useLibraryRoomChannel } from '../../features/player/library/realtime/useLibraryRoomChannel';
import {
  createFakeRealtime,
  FAKE_ROOM_ID,
  FAKE_SELF_ID,
  fakeEnterResponse,
} from '../../features/player/library/dev/fakeRealtime';
import type { LibraryRoomKind } from '../../features/player/library/socialResponses';

afterEach(cleanup);

const IRIS = '00000000-0000-4000-8000-000000000011';
const UNTIL = '2026-10-20T15:30:00.000Z';
const POSITION = { gx: 2, gy: 2, dir: 4 };

function mount(
  kind: LibraryRoomKind = 'hall',
  enterImpl?: () => Promise<ReturnType<typeof fakeEnterResponse>>
) {
  const bus = createFakeRealtime();
  const enter = fakeEnterResponse(kind);
  const social = { enter: vi.fn(enterImpl ?? (async () => enter)) };
  const onEvicted = vi.fn();
  const hook = renderHook(
    ({ roomId }: { roomId: string | null }) =>
      useLibraryRoomChannel(roomId, {
        position: POSITION,
        realtime: bus.client,
        social,
        onEvicted,
      }),
    { initialProps: { roomId: FAKE_ROOM_ID as string | null } }
  );
  return { bus, enter, social, onEvicted, ...hook };
}

describe('useLibraryRoomChannel', () => {
  it('entre dans la salle, se connecte, et voit les autres', async () => {
    const { result, bus, enter, social } = mount();
    expect(['entering', 'connecting']).toContain(result.current.phase);
    await waitFor(() => expect(result.current.phase).toBe('connected'));
    expect(social.enter).toHaveBeenCalledWith(FAKE_ROOM_ID);
    expect(result.current.enter?.room.id).toBe(FAKE_ROOM_ID);
    expect(result.current.visible).toBe(true);

    act(() => {
      bus.peerJoin(enter.topics.room, {
        userId: IRIS,
        nickname: 'Iris',
        avatarId: 'a05',
        gx: 1,
        gy: 1,
        dir: 4,
      });
    });
    expect(result.current.avatars.map((a) => a.nickname)).toEqual(['Iris']);
    expect(result.current.sendEmote('wave')).toBe(true);
  });

  it('salle de lecture : entre discrète, puis se montre sur demande', async () => {
    const { result } = mount('reading_room');
    await waitFor(() => expect(result.current.phase).toBe('connected'));
    expect(result.current.visible).toBe(false);
    expect(result.current.sendEmote('wave')).toBe(false);
    act(() => result.current.setVisible(true));
    await waitFor(() => expect(result.current.visible).toBe(true));
  });

  it('un refus de l’API → `refused`, avec son code et son échéance', async () => {
    const { result, bus } = mount('apartment', async () => {
      throw new PlayerHttpError('Expulsée.', 403, {
        error: 'Expulsée.',
        code: 'room_kicked',
        until: UNTIL,
      });
    });
    await waitFor(() => expect(result.current.phase).toBe('refused'));
    expect(result.current.refusal).toEqual({
      code: 'room_kicked',
      until: UNTIL,
    });
    expect(bus.topics()).toEqual([]);
  });

  it('une panne qui n’est pas un refus de l’API → `enter_failed`', async () => {
    const { result } = mount('hall', async () => {
      throw new TypeError('Failed to fetch');
    });
    await waitFor(() => expect(result.current.phase).toBe('refused'));
    expect(result.current.refusal).toEqual({ code: 'enter_failed' });
  });

  it('expulsée par le serveur → `evicted` et `onEvicted` (une fois)', async () => {
    const { result, bus, enter, onEvicted } = mount('apartment');
    await waitFor(() => expect(result.current.phase).toBe('connected'));
    act(() => {
      bus.server(enter.topics.chat, 'kicked', {
        userId: FAKE_SELF_ID,
        until: UNTIL,
      });
    });
    await waitFor(() => expect(result.current.phase).toBe('evicted'));
    expect(result.current.eviction).toEqual({ kind: 'kicked', until: UNTIL });
    expect(result.current.avatars).toEqual([]);
    expect(onEvicted).toHaveBeenCalledTimes(1);
    expect(onEvicted).toHaveBeenCalledWith({ kind: 'kicked', until: UNTIL });
    expect(bus.topics()).toEqual([]);
  });

  it('`hideLocally` retire tout de suite l’avatar', async () => {
    const { result, bus, enter } = mount();
    await waitFor(() => expect(result.current.phase).toBe('connected'));
    act(() => {
      bus.peerJoin(enter.topics.room, {
        userId: IRIS,
        nickname: 'Iris',
        avatarId: 'a05',
        gx: 1,
        gy: 1,
        dir: 4,
      });
    });
    act(() => result.current.hideLocally(IRIS));
    expect(result.current.avatars).toEqual([]);
  });

  it('démonter (ou quitter la salle) ferme les canaux', async () => {
    const { result, bus, rerender, unmount } = mount();
    await waitFor(() => expect(result.current.phase).toBe('connected'));
    expect(bus.topics()).toHaveLength(4);
    rerender({ roomId: null });
    await waitFor(() => expect(bus.topics()).toEqual([]));
    expect(result.current.phase).toBe('idle');
    unmount();
  });
});
