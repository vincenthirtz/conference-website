// @vitest-environment happy-dom
//
// Women's Library, lot 5 phase B — l'écran d'une salle (`ui/room/RoomStage`)
// contre le Realtime EN MÉMOIRE et des gestes en mémoire (les routes sont
// testées dans conference-api). Le moteur (canvas) est remplacé par un
// témoin : il dit ce qu'il reçoit et rejoue ses rappels.
//   * une joueuse qui entre apparaît dans le moteur ET dans « Présentes dans
//     la salle » ; sa ligne ouvre le menu, un appui dans la vue aussi ;
//   * marcher envoie la case visée ; mon signe parti s'affiche en bulle ;
//   * bloquer depuis le menu la retire ;
//   * refus d'entrée, expulsion : la notice, avec le retour à l'appartement ;
//   * le mode discret n'existe que dans la Grande salle de lecture ;
// et autour : l'appartement ouvert de sa propriétaire montre ses visiteuses
// (et reste solo, sans message, si l'entrée échoue), et les réglages
// proposent de copier son lien.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const IRIS = '00000000-0000-4000-8000-000000000011';

// Le moteur isométrique n'est pas rendu : un témoin.
vi.mock('next/dynamic', async () => {
  const React = await import('react');
  type StubProps = {
    remote?: Array<{
      nickname: string;
      tile: { i: number; j: number };
      bubble: { text: string } | null;
    }>;
    playerBubble?: { text: string } | null;
    playerMarker?: string | null;
    onAvatarTap?: (tap: {
      userId: string;
      anchor: { x: number; y: number };
    }) => void;
    onPlayerWalk?: (goal: { i: number; j: number }) => void;
    onPlayerArrive?: (tile: { i: number; j: number }, dir: number) => void;
  };
  return {
    default: () =>
      function RoomViewStub(props: StubProps) {
        const button = (label: string, onClick: () => void) =>
          React.createElement('button', { type: 'button', onClick }, label);
        return React.createElement(
          'div',
          {
            'data-testid': 'room-view',
            'data-remote': (props.remote ?? [])
              .map(
                (r) =>
                  `${r.nickname}@${r.tile.i},${r.tile.j}${r.bubble ? `:${r.bubble.text}` : ''}`
              )
              .join(' '),
            'data-bubble': props.playerBubble?.text ?? '',
            'data-marker': props.playerMarker ?? '',
          },
          button('stub-tap-iris', () =>
            props.onAvatarTap?.({ userId: IRIS, anchor: { x: 40, y: 60 } })
          ),
          button('stub-walk', () => props.onPlayerWalk?.({ i: 3, j: 4 })),
          button('stub-arrive', () => props.onPlayerArrive?.({ i: 3, j: 4 }, 3))
        );
      },
  };
});

import RoomStage from '../../features/player/library/ui/room/RoomStage';
import ApartmentStage from '../../features/player/library/ui/apartment/ApartmentStage';
import ApartmentSettings from '../../features/player/library/ui/apartment/ApartmentSettings';
import { LibrarySocialProvider } from '../../features/player/library/socialContext';
import {
  createFakeRealtime,
  FAKE_ROOM_ID,
  FAKE_SELF_ID,
  fakeEnterResponse,
  type FakeRealtime,
} from '../../features/player/library/dev/fakeRealtime';
import { createFakeSocialClient } from '../../features/player/library/dev/fakeSocialClient';
import type { LibraryEnterResponse } from '../../features/player/library/socialResponses';
import type { LibraryApartmentResponse } from '../../features/player/library/responses';
import { PlayerHttpError } from '../../utils/player/playerHttp';
import nsSocial from '../../lib/i18n/locales/fr/playerLibrarySocial';
import nsPlayerLibrary from '../../lib/i18n/locales/fr/playerLibrary';
import { format } from '../../lib/i18n/useT';

afterEach(cleanup);

const t = nsSocial.fr;
const tl = nsPlayerLibrary.fr;
const UNTIL = '2026-10-20T15:30:00.000Z';

function withQuery(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function mount(
  kind: LibraryEnterResponse['room']['kind'] = 'hall',
  enterImpl?: () => Promise<LibraryEnterResponse>
) {
  const bus = createFakeRealtime();
  const enter = fakeEnterResponse(kind);
  const enterClient = { enter: vi.fn(enterImpl ?? (async () => enter)) };
  const actions = createFakeSocialClient({ bus, enter });
  render(
    withQuery(
      <RoomStage
        roomId={FAKE_ROOM_ID}
        specs={new Map()}
        backHref="/player/library"
        realtime={bus.client}
        enter={enterClient}
        actions={actions}
      />
    )
  );
  return { bus, enter, enterClient, actions };
}

const joinIris = (bus: FakeRealtime, topic: string, gx = 1, gy = 1) =>
  act(() => {
    bus.peerJoin(topic, {
      userId: IRIS,
      nickname: 'Iris',
      avatarId: 'a05',
      gx,
      gy,
      dir: 4,
    });
  });

const view = () => screen.getByTestId('room-view');
const menuOf = (nickname: string) =>
  screen.findByRole('menu', { name: format(t.menu.label, { nickname }) });

describe('RoomStage — une salle avec les autres', () => {
  it('une joueuse qui entre apparaît dans le moteur et dans la liste ; sa ligne ouvre son menu', async () => {
    const { bus, enter } = mount();
    await screen.findByTestId('room-view');
    expect(screen.getByText(t.room.presentEmpty)).toBeTruthy();
    joinIris(bus, enter.topics.room);
    expect(view().getAttribute('data-remote')).toBe('Iris@1,1');
    const list = screen
      .getByText(t.room.presentTitle)
      .closest('section') as HTMLElement;
    const row = within(list).getByRole('button', { name: 'Iris' });
    expect(row.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(row);
    const menu = await menuOf('Iris');
    expect(
      within(menu).getByRole('menuitem', { name: t.menu.block })
    ).toBeTruthy();
    expect(row.getAttribute('aria-expanded')).toBe('true');
    // Pas chez moi : pas d'expulsion.
    expect(
      within(menu).queryByRole('menuitem', { name: t.menu.kick })
    ).toBeNull();
  });

  it('un appui sur elle dans la vue ouvre le même menu', async () => {
    const { bus, enter } = mount();
    await screen.findByTestId('room-view');
    joinIris(bus, enter.topics.room);
    fireEvent.click(screen.getByRole('button', { name: 'stub-tap-iris' }));
    await menuOf('Iris');
  });

  it('ses signes passent en bulle ; marcher envoie la case visée ; mon signe parti aussi', async () => {
    const { bus, enter } = mount();
    await waitFor(() =>
      expect(document.querySelector('[data-phase="connected"]')).toBeTruthy()
    );
    joinIris(bus, enter.topics.room);
    act(() => {
      bus.peerSend(enter.topics.room, 'emote', { userId: IRIS, emote: 'wave' });
    });
    expect(view().getAttribute('data-remote')).toBe(
      `Iris@1,1:${t.emotes.wave}`
    );

    fireEvent.click(screen.getByRole('button', { name: 'stub-walk' }));
    expect(bus.sent).toContainEqual(
      expect.objectContaining({
        event: 'move',
        payload: expect.objectContaining({
          gx: 3,
          gy: 4,
          userId: FAKE_SELF_ID,
        }),
      })
    );

    fireEvent.click(screen.getByRole('button', { name: t.emotes.heart }));
    expect(view().getAttribute('data-bubble')).toBe(t.emotes.heart);
    // Trop vite : rien ne part, la bulle ne change pas.
    fireEvent.click(screen.getByRole('button', { name: t.phrases.gg }));
    expect(view().getAttribute('data-bubble')).toBe(t.emotes.heart);
    expect(await screen.findByText(t.emoteBar.tooFast)).toBeTruthy();
  });

  it('l’arrivée met ma présence à jour', async () => {
    const { bus, enter } = mount();
    await waitFor(() =>
      expect(document.querySelector('[data-phase="connected"]')).toBeTruthy()
    );
    fireEvent.click(screen.getByRole('button', { name: 'stub-arrive' }));
    await waitFor(
      () =>
        expect(
          bus.presenceState(enter.topics.room)[FAKE_SELF_ID]?.[0]
        ).toMatchObject({
          gx: 3,
          gy: 4,
          dir: 3,
        }),
      { timeout: 2500 }
    );
  });

  it('bloquer depuis le menu la retire de la salle', async () => {
    const { bus, enter } = mount();
    await screen.findByTestId('room-view');
    joinIris(bus, enter.topics.room);
    fireEvent.click(screen.getByRole('button', { name: 'Iris' }));
    const menu = await menuOf('Iris');
    fireEvent.click(within(menu).getByRole('menuitem', { name: t.menu.block }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(
      within(confirm).getByRole('button', { name: t.menu.blockConfirm })
    );
    expect(
      await screen.findByText(format(t.menu.blockDone, { nickname: 'Iris' }))
    ).toBeTruthy();
    expect(view().getAttribute('data-remote')).toBe('');
    expect(screen.getByText(t.room.presentEmpty)).toBeTruthy();
  });

  it('entrée refusée (expulsion en cours) : la notice et le retour à mon appartement', async () => {
    mount('apartment', async () => {
      throw new PlayerHttpError('Expulsée.', 403, {
        error: 'Expulsée.',
        code: 'room_kicked',
        until: UNTIL,
      });
    });
    expect(await screen.findByText(t.notice.kickedEnterTitle)).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: t.room.backToApartment })
        .getAttribute('href')
    ).toBe('/player/library');
    expect(screen.queryByTestId('room-view')).toBeNull();
  });

  it('expulsée pendant la visite : la salle laisse place à la notice', async () => {
    const { bus, enter } = mount('apartment');
    await waitFor(() =>
      expect(document.querySelector('[data-phase="connected"]')).toBeTruthy()
    );
    act(() => {
      bus.server(enter.topics.chat, 'kicked', {
        userId: FAKE_SELF_ID,
        until: UNTIL,
      });
    });
    expect(await screen.findByText(t.notice.kickedTitle)).toBeTruthy();
    expect(screen.queryByTestId('room-view')).toBeNull();
  });

  it('une panne d’entrée propose de réessayer', async () => {
    let fail = true;
    const { enterClient } = mount('hall', async () => {
      if (fail) throw new TypeError('Failed to fetch');
      return fakeEnterResponse('hall');
    });
    const retry = await screen.findByRole('button', { name: t.room.retry });
    expect(screen.getByText(t.notice.errorTitle)).toBeTruthy();
    fail = false;
    fireEvent.click(retry);
    await waitFor(() => expect(enterClient.enter).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('room-view')).toBeTruthy();
  });

  it('Grande salle de lecture : discrète à l’entrée (repère), visible sur demande', async () => {
    mount('reading_room');
    const stay = await screen.findByRole('radio', { name: t.discreet.stay });
    expect((stay as HTMLInputElement).checked).toBe(true);
    await waitFor(() =>
      expect(view().getAttribute('data-marker')).toBe(t.room.discreetMarker)
    );
    fireEvent.click(screen.getByRole('radio', { name: t.discreet.show }));
    await waitFor(() => expect(view().getAttribute('data-marker')).toBe(''));
  });

  it('ailleurs : pas de mode discret, pas de repère', async () => {
    mount('hall');
    await waitFor(() =>
      expect(document.querySelector('[data-phase="connected"]')).toBeTruthy()
    );
    expect(screen.queryByRole('radio', { name: t.discreet.stay })).toBeNull();
    expect(view().getAttribute('data-marker')).toBe('');
  });
});

describe('l’appartement de sa propriétaire', () => {
  const apartment = (access: 'open' | 'private'): LibraryApartmentResponse => ({
    room: {
      id: FAKE_ROOM_ID,
      name: null,
      access,
      listed: false,
      width: 14,
      depth: 12,
      decor: { floor: 'parquet', wall: 'plain' },
      version: 1,
    },
    items: [],
  });

  function mountOwner(
    access: 'open' | 'private',
    enterImpl?: () => Promise<LibraryEnterResponse>
  ) {
    const bus = createFakeRealtime();
    const enter = fakeEnterResponse('apartment');
    const deps = {
      realtime: bus.client,
      enter: { enter: vi.fn(enterImpl ?? (async () => enter)) },
      actions: createFakeSocialClient({ bus, enter }),
    };
    render(
      withQuery(
        <LibrarySocialProvider deps={deps}>
          <ApartmentStage
            apartment={apartment(access)}
            specs={new Map()}
            avatarId="a03"
            inventory={[]}
            label="Appartement"
            saveItems={vi.fn()}
            onSaved={vi.fn()}
            onConflict={vi.fn()}
          />
        </LibrarySocialProvider>
      )
    );
    return { bus, enter, deps };
  }

  it('ouvert : elle voit ses visiteuses, et peut les expulser', async () => {
    const { bus, enter } = mountOwner('open');
    await screen.findByText(t.room.presentEmpty);
    joinIris(bus, enter.topics.room, 2, 3);
    expect(view().getAttribute('data-remote')).toBe('Iris@2,3');
    fireEvent.click(screen.getByRole('button', { name: 'Iris' }));
    const menu = await menuOf('Iris');
    expect(
      within(menu).getByRole('menuitem', { name: t.menu.kick })
    ).toBeTruthy();
  });

  it('privé : aucune connexion', async () => {
    const { deps } = mountOwner('private');
    await screen.findByTestId('room-view');
    expect(deps.enter.enter).not.toHaveBeenCalled();
    expect(screen.queryByText(t.room.presentTitle)).toBeNull();
  });

  it('entrée impossible (Library indisponible) : solo, comme avant, sans message', async () => {
    const { deps } = mountOwner('open', async () => {
      throw new PlayerHttpError('indisponible', 503, {
        error: 'indisponible',
        code: 'library_unavailable',
      });
    });
    await waitFor(() => expect(deps.enter.enter).toHaveBeenCalledTimes(1));
    await screen.findByTestId('room-view');
    expect(screen.queryByText(t.room.presentTitle)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(t.notice.errorTitle)).toBeNull();
  });
});

describe('les réglages : le lien de mon appartement', () => {
  const room = (access: 'open' | 'private') => ({
    id: FAKE_ROOM_ID,
    name: null,
    access,
    listed: false,
    width: 14,
    depth: 12,
    decor: { floor: 'parquet' as const, wall: 'plain' as const },
    version: 1,
  });

  it('ouvert : « Copier le lien » copie /player/library?room=<id>', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(
      <ApartmentSettings room={room('open')} saving={false} onSave={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: tl.shareLink }));
    expect(await screen.findByText(tl.shareCopied)).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/player/library?room=${FAKE_ROOM_ID}`
    );
  });

  it('copie impossible : le lien s’affiche, à sélectionner', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn(async () => {
          throw new Error('denied');
        }),
      },
      configurable: true,
    });
    render(
      <ApartmentSettings room={room('open')} saving={false} onSave={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: tl.shareLink }));
    expect(await screen.findByText(tl.shareFailed)).toBeTruthy();
    expect(
      (screen.getByLabelText(tl.shareLinkLabel) as HTMLInputElement).value
    ).toContain(`/player/library?room=${FAKE_ROOM_ID}`);
  });

  it('privé : pas de lien', () => {
    render(
      <ApartmentSettings
        room={room('private')}
        saving={false}
        onSave={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: tl.shareLink })).toBeNull();
  });
});
