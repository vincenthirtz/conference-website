// @vitest-environment happy-dom
//
// Women's Library, lot 4 — l'écran « Mon appartement » (/player/library),
// rendu dans le harnais joueuse + cache, contre des RÉPONSES fixes de l'API
// (les routes sont testées dans conference-api). Ce que ces cas protègent :
//   * LA PORTE : sans attestation, seul l'écran « 18 ans ou plus » s'affiche,
//     rien d'autre n'est lu (l'appartement serait créé pour rien) ; mineure et
//     bannie ont leur écran, sans formulaire ;
//   * L'ACHAT porte une Idempotency-Key, un double clic n'envoie qu'UNE
//     requête, un refus « pièces insuffisantes » dit le manque exact ;
//   * l'avatar et les réglages n'envoient que ce qui change, et leurs refus
//     sont traduits par leur `code`.
// Le moteur (canvas) est remplacé par un témoin : il a ses propres tests.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
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
// Le moteur isométrique n'est pas rendu ici : un témoin dit ce qu'il reçoit.
vi.mock('next/dynamic', async () => {
  const React = await import('react');
  return {
    default: () =>
      function ApartmentViewStub(props: {
        room: { version: number };
        items: Array<{ inventoryId: string; gx: number; gy: number }>;
        avatarId: string;
        mode?: string;
        ghost?: { inventoryId: string; valid: boolean } | null;
        selectedId?: string | null;
      }) {
        return React.createElement('div', {
          'data-testid': 'apartment-view',
          'data-version': props.room.version,
          'data-items': props.items.length,
          'data-layout': props.items
            .map((i) => `${i.inventoryId}@${i.gx},${i.gy}`)
            .join(' '),
          'data-avatar': props.avatarId,
          'data-mode': props.mode,
          'data-ghost': props.ghost
            ? `${props.ghost.inventoryId}:${props.ghost.valid}`
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

type Call = { url: string; method: string; body: any; headers: Headers };
let calls: Call[] = [];
type Reply = { status: number; body: unknown };
let replies: Record<string, Reply | Reply[]>;

const ME_OK: Reply = {
  status: 200,
  body: {
    attested: true,
    attestedAt: '2026-10-01T08:00:00.000Z',
    avatar: { nickname: 'Lune', avatarId: 'a03', look: {} },
    inventory: [
      { id: 'inv-lamp-1', key: 'lamp', acquiredAt: '2026-10-05T00:00:00.000Z' },
      { id: 'inv-lamp-2', key: 'lamp', acquiredAt: '2026-10-06T00:00:00.000Z' },
      {
        id: 'inv-chair',
        key: 'armchair',
        acquiredAt: '2026-10-07T00:00:00.000Z',
      },
    ],
    inventoryTruncated: false,
    balance: 120,
  },
};
const CATALOG_OK: Reply = {
  status: 200,
  body: {
    tileSizeM: 0.5,
    rotations: 4,
    furniture: [
      {
        key: 'lamp',
        category: 'lighting',
        footprint: { w: 1, d: 2 },
        heightM: 0.89,
        price: 75,
        sittable: false,
        stackable: true,
        layer: 'object',
      },
      {
        key: 'armchair',
        category: 'seating',
        footprint: { w: 2, d: 2 },
        heightM: 1.07,
        price: 250,
        sittable: true,
        stackable: false,
        layer: 'object',
      },
    ],
    avatars: ['a01', 'a02', 'a03'],
  },
};
const APARTMENT_OK: Reply = {
  status: 200,
  body: {
    room: {
      id: 'room-1',
      name: null,
      access: 'private',
      listed: false,
      width: 14,
      depth: 12,
      decor: { floor: 'parquet', wall: 'plain' },
      version: 3,
    },
    items: [
      { inventoryId: 'inv-lamp-2', key: 'lamp', gx: 1, gy: 1, rotation: 0 },
    ],
  },
};

const refusal = (status: number, code: string, extra = {}): Reply => ({
  status,
  body: { error: 'refus', code, ...extra },
});

function route(url: string, method: string): Reply {
  const path = url.split('?')[0];
  const r = replies[`${method} ${path}`];
  if (Array.isArray(r)) return r.length > 1 ? (r.shift() as Reply) : r[0];
  return r ?? { status: 404, body: { error: 'not found' } };
}

beforeEach(() => {
  calls = [];
  replies = {
    'GET /api/player/library/me': ME_OK,
    'GET /api/player/library/catalog': CATALOG_OK,
    'GET /api/player/library/apartment': APARTMENT_OK,
  };
  vi.clearAllMocks();
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body, headers: new Headers(init?.headers) });
    const r = route(url, method);
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
});
afterEach(cleanup);

function renderScreen() {
  // Un client neuf par test : le cache joueuse est un singleton navigateur.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return renderPlayer(
    <QueryClientProvider client={client}>
      <PlayerQueryProvider>
        <ApartmentScreen />
      </PlayerQueryProvider>
    </QueryClientProvider>
  );
}

const sent = (method: string, path: string) =>
  calls.filter((c) => c.method === method && c.url.split('?')[0] === path);

describe('la porte de la Library', () => {
  it('sans attestation : la case « 18 ans ou plus », rien d’autre n’est lu', async () => {
    replies['GET /api/player/library/me'] = [
      refusal(403, 'LIBRARY_ADULT_REQUIRED'),
      ME_OK,
    ];
    replies['POST /api/player/library/attest-adult'] = {
      status: 200,
      body: { attested: true, attestedAt: 'x', avatar: ME_OK.body },
    };
    renderScreen();

    const box = await screen.findByRole('checkbox', { name: t.gateCheckbox });
    expect(screen.getByText(t.gateWhy)).toBeTruthy();
    expect(
      screen.getByRole('link', { name: t.safetyLink }).getAttribute('href')
    ).toBe('/securite');
    const submit = screen.getByRole('button', { name: t.gateSubmit });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect(sent('GET', '/api/player/library/apartment')).toHaveLength(0);
    expect(sent('GET', '/api/player/library/catalog')).toHaveLength(0);

    fireEvent.click(box);
    fireEvent.click(submit);

    await screen.findByTestId('apartment-view');
    const [attest] = sent('POST', '/api/player/library/attest-adult');
    expect(attest.body).toEqual({ adult: true });
    expect(attest.headers.get('Idempotency-Key')).toBeTruthy();
    expect(sent('GET', '/api/player/library/apartment')).toHaveLength(1);
  });

  it('mineure connue : refus bienveillant et lien vers /securite, sans formulaire', async () => {
    replies['GET /api/player/library/me'] = refusal(403, 'LIBRARY_MINOR');
    renderScreen();
    expect(await screen.findByText(t.minorTitle)).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(
      screen.getByRole('link', { name: t.safetyLink }).getAttribute('href')
    ).toBe('/securite');
    expect(sent('GET', '/api/player/library/apartment')).toHaveLength(0);
  });

  it('bannie : message neutre, sans formulaire', async () => {
    replies['GET /api/player/library/me'] = refusal(403, 'LIBRARY_BANNED');
    renderScreen();
    expect(await screen.findByText(t.bannedBody)).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(sent('GET', '/api/player/library/apartment')).toHaveLength(0);
  });

  it('Library indisponible (503) : on peut réessayer', async () => {
    replies['GET /api/player/library/me'] = [
      refusal(503, 'library_unavailable'),
      ME_OK,
    ];
    renderScreen();
    expect(await screen.findByText(t.unavailable)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.retry }));
    await screen.findByTestId('apartment-view');
  });
});

describe('l’appartement', () => {
  it('monte le moteur avec l’appartement de l’API et l’avatar choisi', async () => {
    renderScreen();
    const view = await screen.findByTestId('apartment-view');
    expect(view.getAttribute('data-version')).toBe('3');
    expect(view.getAttribute('data-items')).toBe('1');
    expect(view.getAttribute('data-avatar')).toBe('a03');
    // Nom par défaut, accès privé, solde.
    expect(
      screen.getByText(format(t.apartmentDefaultName, { nickname: 'Lune' }))
    ).toBeTruthy();
    expect(screen.getByTestId('library-apartment-access').textContent).toBe(
      t.apartmentPrivate
    );
  });

  it('« Mes meubles » distingue posés et rangés', async () => {
    renderScreen();
    fireEvent.click(await screen.findByRole('tab', { name: t.tabInventory }));
    const lamp = await screen.findByTestId('library-inventory-lamp');
    expect(
      within(lamp).getByText(format(t.inventoryPlaced, { count: 1 }))
    ).toBeTruthy();
    expect(
      within(lamp).getByText(format(t.inventoryStored, { count: 1 }))
    ).toBeTruthy();
    expect(
      screen.getByText(format(t.inventorySummary, { placed: 1, stored: 2 }))
    ).toBeTruthy();
  });
});

describe('la boutique', () => {
  const buyButton = async (name: string, price: number) =>
    screen.findByRole('button', {
      name: format(t.shopBuyAria, { name, price }),
    });

  it('achète avec une Idempotency-Key ; un double clic n’envoie qu’une requête', async () => {
    let release: (() => void) | null = null;
    replies['POST /api/player/library/furniture/buy'] = {
      status: 200,
      body: {
        inventoryId: 'inv-new',
        key: 'lamp',
        price: 75,
        balance: 45,
        replayed: false,
      },
    };
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/furniture/buy'))
        await new Promise<void>((r) => {
          release = r;
        });
      return (realFetch as any)(url, init);
    }) as unknown as typeof fetch;

    renderScreen();
    const button = await buyButton(t.furniture.lamp, 75);
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(release).not.toBeNull());
    (release as unknown as () => void)();

    expect(
      await screen.findByText(format(t.shopBought, { name: t.furniture.lamp }))
    ).toBeTruthy();
    const buys = sent('POST', '/api/player/library/furniture/buy');
    expect(buys).toHaveLength(1);
    expect(buys[0].body).toEqual({ key: 'lamp' });
    expect(buys[0].headers.get('Idempotency-Key')).toBeTruthy();
  });

  it('pièces insuffisantes : le manque exact, d’après le solde du registre', async () => {
    replies['POST /api/player/library/furniture/buy'] = refusal(
      400,
      'insufficient_funds',
      { balance: 200, price: 250 }
    );
    renderScreen();
    fireEvent.click(await buyButton(t.furniture.armchair, 250));
    expect(
      await screen.findByText(
        format(t.shopInsufficient, { missing: 50, name: t.furniture.armchair })
      )
    ).toBeTruthy();
  });

  it('sans manifeste de sprites : des vignettes de remplacement, pas d’erreur', async () => {
    renderScreen();
    const lamp = await screen.findByTestId('library-shop-lamp');
    expect(
      lamp.querySelector('[data-sprite]')?.getAttribute('data-sprite')
    ).toBe('placeholder');
  });
});

describe('avatar et réglages', () => {
  it('le pseudo pris est dit sous le champ ; seul ce qui change est envoyé', async () => {
    replies['PUT /api/player/library/avatar'] = refusal(409, 'nickname_taken');
    renderScreen();
    fireEvent.click(await screen.findByRole('tab', { name: t.tabAvatar }));
    const field = await screen.findByLabelText(t.nicknameLabel);
    fireEvent.change(field, { target: { value: 'Etoile' } });
    fireEvent.click(screen.getByRole('button', { name: t.avatarSave }));
    expect(await screen.findByText(t.avatarErrors.nickname_taken)).toBeTruthy();
    const [put] = sent('PUT', '/api/player/library/avatar');
    expect(put.body).toEqual({ nickname: 'Etoile' });
  });

  it('changer d’avatar envoie son identifiant seul', async () => {
    replies['PUT /api/player/library/avatar'] = {
      status: 200,
      body: { avatar: { nickname: 'Lune', avatarId: 'a01', look: {} } },
    };
    renderScreen();
    fireEvent.click(await screen.findByRole('tab', { name: t.tabAvatar }));
    fireEvent.click(
      await screen.findByRole('radio', {
        name: format(t.avatarOption, { n: 1 }),
      })
    );
    fireEvent.click(screen.getByRole('button', { name: t.avatarSave }));
    expect(await screen.findByText(t.avatarSaved)).toBeTruthy();
    expect(sent('PUT', '/api/player/library/avatar')[0].body).toEqual({
      avatarId: 'a01',
    });
    await waitFor(() =>
      expect(
        screen.getByTestId('apartment-view').getAttribute('data-avatar')
      ).toBe('a01')
    );
  });

  it('réglages : la liste du hall suppose l’ouverture ; le PATCH ne porte que les changements', async () => {
    replies['PATCH /api/player/library/apartment'] = {
      status: 200,
      body: {
        room: {
          ...(APARTMENT_OK.body as any).room,
          access: 'open',
          listed: true,
          decor: { floor: 'tiles', wall: 'plain' },
        },
      },
    };
    renderScreen();
    fireEvent.click(await screen.findByRole('tab', { name: t.tabSettings }));
    const listed = (await screen.findByRole('checkbox', {
      name: t.listedLabel,
    })) as HTMLInputElement;
    expect(listed.disabled).toBe(true);

    fireEvent.click(screen.getByRole('radio', { name: t.accessOpen }));
    expect(listed.disabled).toBe(false);
    fireEvent.click(listed);
    fireEvent.change(screen.getByLabelText(t.floorLabel), {
      target: { value: 'tiles' },
    });
    fireEvent.click(screen.getByRole('button', { name: t.settingsSave }));

    expect(await screen.findByText(t.settingsSaved)).toBeTruthy();
    expect(sent('PATCH', '/api/player/library/apartment')[0].body).toEqual({
      access: 'open',
      listed: true,
      decor: { floor: 'tiles' },
    });
    expect(screen.getByTestId('library-apartment-access').textContent).toBe(
      t.apartmentOpen
    );
  });

  it('un nom refusé est traduit par son code', async () => {
    replies['PATCH /api/player/library/apartment'] = refusal(
      400,
      'room_name_refused'
    );
    renderScreen();
    fireEvent.click(await screen.findByRole('tab', { name: t.tabSettings }));
    fireEvent.change(await screen.findByLabelText(t.nameLabel), {
      target: { value: 'Chez moi' },
    });
    fireEvent.click(screen.getByRole('button', { name: t.settingsSave }));
    expect(
      await screen.findByText(t.settingsErrors.room_name_refused)
    ).toBeTruthy();
  });
});
