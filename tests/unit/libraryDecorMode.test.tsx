// @vitest-environment happy-dom
//
// Women's Library, lot 4 phase B — le MODE DÉCO de « Mon appartement », contre
// des RÉPONSES fixes de l'API (les routes sont testées dans conference-api).
// Le moteur est remplacé par un témoin qui expose ce que la vue reçoit (salle,
// fantôme, sélection) et rejoue le clavier et le pointeur du vrai cadre.
//   * un geste s'applique TOUT DE SUITE, l'enregistrement part ensuite, en
//     ÉTAT COMPLET avec la version lue ;
//   * 409 `room_conflict` : l'appartement est relu et remplace l'état local ;
//   * 400 `placement_invalid` : le meuble fautif reprend sa place, on dit lequel ;
//   * clavier (flèches, Suppr, Entrée) et toucher (amener puis poser) passent
//     par les mêmes gestes.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react';

vi.mock('@/utils/supabaseBrowser', () => ({
  supabaseClient: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 't' } } }),
    },
  },
}));
const replace = vi.hoisted(() => vi.fn(async () => true));
vi.mock('next/router', () => ({
  default: { asPath: '/player/library', replace },
  useRouter: () => ({ asPath: '/player/library', query: {}, replace }),
}));
const view = vi.hoisted(() => ({ props: null as any }));
vi.mock('next/dynamic', async () => {
  const React = await import('react');
  return {
    default: () =>
      function ApartmentViewStub(props: any) {
        view.props = props;
        return React.createElement('div', {
          'data-testid': 'apartment-view',
          tabIndex: 0,
          onKeyDown: props.onKeyDown,
          'data-version': props.room.version,
          'data-layout': props.items
            .map((i: any) => `${i.inventoryId}@${i.gx},${i.gy},${i.rotation}`)
            .join(' '),
          'data-mode': props.mode,
          'data-ghost': props.ghost
            ? `${props.ghost.inventoryId}@${props.ghost.gx},${props.ghost.gy}:${props.ghost.valid}`
            : '',
          'data-selected': props.selectedId ?? '',
        });
      },
  };
});

import ApartmentScreen from '../../features/player/library/ui/apartment/ApartmentScreen';
import { PlayerQueryProvider } from '../../features/player/_shared/query';
import nsPlayerLibrary from '../../lib/i18n/locales/fr/playerLibrary';
import { format } from '../../lib/i18n/useT';
import { renderPlayer } from './__helpers__/playerHarness';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const t = nsPlayerLibrary.fr;
const e = t.edit;

type Call = { url: string; method: string; body: any };
let calls: Call[] = [];
type Reply = { status: number; body: unknown };
let replies: Record<string, Reply | Reply[]>;

const ROOM = {
  id: 'room-1',
  name: 'Chez Lune',
  access: 'private',
  listed: false,
  width: 14,
  depth: 12,
  decor: { floor: 'parquet', wall: 'plain' },
  version: 3,
};
const LAMP_PLACED = {
  inventoryId: 'inv-lamp',
  key: 'lamp',
  gx: 1,
  gy: 1,
  rotation: 0,
};
const furniture = (key: string, w: number, d: number, layer = 'object') => ({
  key,
  category: 'decor',
  footprint: { w, d },
  heightM: 1,
  price: 100,
  sittable: false,
  stackable: false,
  layer,
});

function route(url: string, method: string): Reply {
  const r = replies[`${method} ${url.split('?')[0]}`];
  if (Array.isArray(r)) return r.length > 1 ? (r.shift() as Reply) : r[0];
  return r ?? { status: 404, body: { error: 'not found' } };
}

beforeEach(() => {
  calls = [];
  view.props = null;
  replies = {
    'GET /api/player/library/me': {
      status: 200,
      body: {
        attested: true,
        attestedAt: '2026-10-01T08:00:00.000Z',
        avatar: { nickname: 'Lune', avatarId: 'a03', look: {} },
        inventory: [
          { id: 'inv-lamp', key: 'lamp', acquiredAt: '' },
          { id: 'inv-chair', key: 'armchair', acquiredAt: '' },
          { id: 'inv-rug', key: 'rug_red', acquiredAt: '' },
        ],
        inventoryTruncated: false,
        balance: 100,
      },
    },
    'GET /api/player/library/catalog': {
      status: 200,
      body: {
        tileSizeM: 0.5,
        rotations: 4,
        furniture: [
          furniture('lamp', 1, 2),
          furniture('armchair', 2, 2),
          furniture('rug_red', 6, 4, 'floor'),
        ],
        avatars: ['a01', 'a03'],
      },
    },
    'GET /api/player/library/apartment': {
      status: 200,
      body: { room: ROOM, items: [LAMP_PLACED] },
    },
  };
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body });
    const r = route(url, method);
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
});
afterEach(cleanup);

async function openDecor() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  renderPlayer(
    <QueryClientProvider client={client}>
      <PlayerQueryProvider>
        <ApartmentScreen />
      </PlayerQueryProvider>
    </QueryClientProvider>
  );
  fireEvent.click(await screen.findByRole('button', { name: e.toggle }));
  await screen.findByTestId('library-edit-panel');
}

const stub = () => screen.getByTestId('apartment-view');
const saves = () =>
  calls.filter(
    (c) =>
      c.method === 'PUT' &&
      c.url.startsWith('/api/player/library/apartment/items')
  );
const savedRoom = (version: number, items: unknown[]) => ({
  status: 200,
  body: { room: { ...ROOM, version }, items },
});

describe('mode déco : poser et enregistrer', () => {
  it('« Décorer » passe le moteur en mode déco ; « Terminer » le rend', async () => {
    await openDecor();
    expect(stub().getAttribute('data-mode')).toBe('edit');
    fireEvent.click(screen.getByRole('button', { name: e.done }));
    expect(stub().getAttribute('data-mode')).toBe('walk');
  });

  it('un meuble rangé devient un fantôme vert, se pose, puis l’état complet part avec la version lue', async () => {
    replies['PUT /api/player/library/apartment/items'] = savedRoom(4, [
      LAMP_PLACED,
      { inventoryId: 'inv-chair', key: 'armchair', gx: 7, gy: 6, rotation: 0 },
    ]);
    await openDecor();
    fireEvent.click(
      screen.getByRole('button', {
        name: format(e.placeAria, { name: t.furniture.armchair }),
      })
    );
    expect(stub().getAttribute('data-ghost')).toBe('inv-chair@7,6:true');
    expect(screen.getByText(e.ghostValid)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: e.place }));
    // Appliqué tout de suite…
    expect(stub().getAttribute('data-layout')).toBe(
      'inv-lamp@1,1,0 inv-chair@7,6,0'
    );
    expect(stub().getAttribute('data-selected')).toBe('inv-chair');
    // …enregistré ensuite, en état complet.
    await waitFor(() => expect(saves()).toHaveLength(1), { timeout: 3000 });
    expect(saves()[0].body).toEqual({
      version: 3,
      items: [
        { inventoryId: 'inv-lamp', gx: 1, gy: 1, rotation: 0 },
        { inventoryId: 'inv-chair', gx: 7, gy: 6, rotation: 0 },
      ],
    });
    expect(await screen.findByText(e.status.saved)).toBeTruthy();
    await waitFor(() => expect(stub().getAttribute('data-version')).toBe('4'));
  });

  it('un fantôme sur un autre objet est rouge et ne se pose pas ; un tapis passe sous la lampe', async () => {
    await openDecor();
    fireEvent.click(
      screen.getByRole('button', {
        name: format(e.placeAria, { name: t.furniture.armchair }),
      })
    );
    act(() =>
      view.props.onPointer({
        kind: 'hover',
        tile: { i: 1, j: 1 },
        wall: null,
        itemId: null,
        pointerType: 'mouse',
      })
    );
    expect(stub().getAttribute('data-ghost')).toBe('inv-chair@1,1:false');
    expect(screen.getByText(e.ghostReasons.overlap)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: e.place }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: e.cancel }));

    fireEvent.click(
      screen.getByRole('button', {
        name: format(e.placeAria, { name: t.furniture.rug_red }),
      })
    );
    act(() =>
      view.props.onPointer({
        kind: 'tap',
        tile: { i: 2, j: 2 },
        wall: null,
        itemId: null,
        pointerType: 'mouse',
      })
    );
    expect(stub().getAttribute('data-layout')).toContain('inv-rug@0,1,0');
  });
});

describe('mode déco : refus de l’API', () => {
  it('409 room_conflict : l’appartement est relu et remplace l’état local', async () => {
    replies['PUT /api/player/library/apartment/items'] = {
      status: 409,
      body: { error: 'conflit', code: 'room_conflict', version: 5 },
    };
    await openDecor();
    replies['GET /api/player/library/apartment'] = {
      status: 200,
      body: {
        room: { ...ROOM, version: 5 },
        items: [{ ...LAMP_PLACED, gx: 9, gy: 9 }],
      },
    };
    fireEvent.click(
      screen.getByRole('button', {
        name: format(e.placeAria, { name: t.furniture.armchair }),
      })
    );
    fireEvent.click(screen.getByRole('button', { name: e.place }));

    expect(
      await screen.findByText(e.status.conflict, undefined, { timeout: 3000 })
    ).toBeTruthy();
    await waitFor(() =>
      expect(stub().getAttribute('data-layout')).toBe('inv-lamp@9,9,0')
    );
    expect(stub().getAttribute('data-version')).toBe('5');
  });

  it('400 placement_invalid : le meuble fautif retourne à l’inventaire, et on dit lequel', async () => {
    replies['PUT /api/player/library/apartment/items'] = {
      status: 400,
      body: {
        error: 'refus',
        code: 'placement_invalid',
        issues: [{ inventoryId: 'inv-chair', reason: 'overlap' }],
      },
    };
    await openDecor();
    fireEvent.click(
      screen.getByRole('button', {
        name: format(e.placeAria, { name: t.furniture.armchair }),
      })
    );
    fireEvent.click(screen.getByRole('button', { name: e.place }));

    expect(
      await screen.findByText(
        format(e.status.invalid, { names: t.furniture.armchair }),
        undefined,
        { timeout: 3000 }
      )
    ).toBeTruthy();
    expect(stub().getAttribute('data-layout')).toBe('inv-lamp@1,1,0');
  });
});

describe('mode déco : clavier et toucher', () => {
  it('sélectionner dans la liste, déplacer aux flèches, pivoter (R), ranger (Suppr)', async () => {
    replies['PUT /api/player/library/apartment/items'] = savedRoom(4, []);
    await openDecor();
    fireEvent.click(
      screen.getByRole('button', {
        name: format(e.selectAria, { name: t.furniture.lamp }),
      })
    );
    expect(stub().getAttribute('data-selected')).toBe('inv-lamp');
    fireEvent.keyDown(stub(), { key: 'ArrowRight' });
    fireEvent.keyDown(stub(), { key: 'ArrowDown' });
    expect(stub().getAttribute('data-layout')).toBe('inv-lamp@2,2,0');
    fireEvent.keyDown(stub(), { key: 'r' });
    expect(stub().getAttribute('data-layout')).toBe('inv-lamp@2,2,1');
    fireEvent.keyDown(stub(), { key: 'Delete' });
    expect(stub().getAttribute('data-layout')).toBe('');
    expect(stub().getAttribute('data-selected')).toBe('');
  });

  it('Entrée reprend le meuble sélectionné, Échap annule, Entrée pose', async () => {
    await openDecor();
    fireEvent.click(
      screen.getByRole('button', {
        name: format(e.selectAria, { name: t.furniture.lamp }),
      })
    );
    fireEvent.keyDown(stub(), { key: 'Enter' });
    expect(stub().getAttribute('data-ghost')).toBe('inv-lamp@1,1:true');
    fireEvent.keyDown(stub(), { key: 'ArrowRight' });
    fireEvent.keyDown(stub(), { key: 'Escape' });
    expect(stub().getAttribute('data-ghost')).toBe('');
    expect(stub().getAttribute('data-layout')).toBe('inv-lamp@1,1,0');
    fireEvent.keyDown(stub(), { key: 'Enter' });
    fireEvent.keyDown(stub(), { key: 'ArrowDown' });
    fireEvent.keyDown(stub(), { key: 'Enter' });
    expect(stub().getAttribute('data-layout')).toBe('inv-lamp@1,2,0');
  });

  it('au doigt : un toucher amène le fantôme, un second toucher au même endroit le pose ; toucher un meuble le sélectionne', async () => {
    await openDecor();
    const tap = (i: number, j: number, itemId: string | null = null) =>
      act(() =>
        view.props.onPointer({
          kind: 'tap',
          tile: { i, j },
          wall: null,
          itemId,
          pointerType: 'touch',
        })
      );
    tap(1, 2);
    expect(stub().getAttribute('data-selected')).toBe('inv-lamp');
    fireEvent.click(screen.getByRole('button', { name: e.deselect }));

    fireEvent.click(
      screen.getByRole('button', {
        name: format(e.placeAria, { name: t.furniture.armchair }),
      })
    );
    tap(10, 8);
    expect(stub().getAttribute('data-ghost')).toBe('inv-chair@10,8:true');
    expect(stub().getAttribute('data-layout')).not.toContain('inv-chair');
    tap(10, 8);
    expect(stub().getAttribute('data-ghost')).toBe('');
    expect(stub().getAttribute('data-layout')).toContain('inv-chair@10,8,0');
  });
});
