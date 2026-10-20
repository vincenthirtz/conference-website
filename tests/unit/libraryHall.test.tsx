// @vitest-environment happy-dom
//
// Women's Library, lot 7 — le hall sans canvas (`ui/hall/**`), la navigation
// « Lieux » (`ui/places/**`) et la case « apparaître dans la liste du hall »,
// contre des clients EN MÉMOIRE qui rendent des RÉPONSES fixes de l'API (les
// routes sont testées dans conference-api, libraryHallApi.test.ts) :
//   * le panneau d'annonces : la liste (titre, date, extrait), « Lire » ouvre
//     l'article dans un dialogue (Markdown rendu, HTML brut inerte, « la suite
//     sur le site »), retour à la liste, Échap ferme ; une lecture ratée se dit ;
//   * les portes : la salle de lecture est un LIEU (`?place=`), la liste des
//     appartements et les QG (lot 9) des PANNEAUX ; aucune porte ne dit
//     combien de personnes sont dans la salle de lecture ;
//   * un appui sur une zone de la vue (`requestHallSpot`) ouvre le même panneau ;
//   * « Lieux » : le lieu courant est marqué, le QG ouvre la porte du lot 9 ;
//   * `?place=` : la porte d'abord, puis la salle commune (sans
//     Idempotency-Key), puis l'écran de la salle ;
//   * les réglages : « listé » seulement quand l'appartement est ouvert.

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

const push = vi.hoisted(() => vi.fn(async () => true));
vi.mock('next/router', () => ({
  default: { asPath: '/player/library', push },
  useRouter: () => ({ asPath: '/player/library', query: {}, push }),
}));
vi.mock('@/utils/supabaseBrowser', () => ({
  supabaseClient: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 't' } } }),
    },
  },
}));
// L'écran d'une salle (moteur, temps réel) a ses tests : ici un témoin.
vi.mock('../../features/player/library/ui/room/RoomScreen', async () => {
  const React = await import('react');
  return {
    default: ({ roomId }: { roomId: string }) =>
      React.createElement('div', {
        'data-testid': 'room-screen',
        'data-room': roomId,
      }),
  };
});

import {
  type LibraryClient,
  LibraryClientProvider,
} from '../../features/player/library/clientContext';
import type { HallClient } from '../../features/player/library/hall/client';
import { HallClientProvider } from '../../features/player/library/hall/clientContext';
import { requestHallSpot } from '../../features/player/library/hall/spotRequests';
import type {
  LibraryHallAnnouncement,
  LibraryOpenRoomsResponse,
} from '../../features/player/library/hallResponses';
import type { TeamHqClient } from '../../features/player/library/teamHq/client';
import { TeamHqClientProvider } from '../../features/player/library/teamHq/clientContext';
import ApartmentSettings from '../../features/player/library/ui/apartment/ApartmentSettings';
import AnnouncementMarkdown from '../../features/player/library/ui/hall/AnnouncementMarkdown';
import HallExtras from '../../features/player/library/ui/hall/HallExtras';
import PlaceScreen from '../../features/player/library/ui/places/PlaceScreen';
import PlacesNav from '../../features/player/library/ui/places/PlacesNav';
import nsHall from '../../lib/i18n/locales/fr/playerLibraryHall';
import nsTeamHq from '../../lib/i18n/locales/fr/playerLibraryTeamHq';
import { format } from '../../lib/i18n/useT';
import { PlayerHttpError } from '../../utils/player/playerHttp';
import { renderPlayer } from './__helpers__/playerHarness';

const t = nsHall.fr;
const HALL_ROOM_ID = '00000000-0000-4000-8000-0000000000a7';
const APT_1 = '00000000-0000-4000-8000-0000000000b1';
const APT_2 = '00000000-0000-4000-8000-0000000000b2';

afterEach(() => {
  cleanup();
  push.mockClear();
});

const ANNOUNCEMENT = (
  over: Partial<LibraryHallAnnouncement> = {}
): LibraryHallAnnouncement => ({
  id: 'n1',
  slug: 'finale-du-23-10',
  title: 'Finale du 23/10',
  excerpt: 'Rendez-vous samedi sur Twitch !',
  content:
    'Rendez-vous **samedi** sur [Twitch](https://twitch.tv/x) !\n\n<script>alert(1)</script>',
  contentTruncated: false,
  publishedAt: '2026-10-15T10:00:00.000Z',
  ...over,
});

const PAGE_1: LibraryOpenRoomsResponse = {
  rooms: [{ roomId: APT_1, name: 'Le salon', ownerNickname: 'Soleil' }],
  nextCursor: 'c1',
};
const PAGE_2: LibraryOpenRoomsResponse = {
  rooms: [{ roomId: APT_2, name: null, ownerNickname: 'Etoile' }],
  nextCursor: null,
};

function makeHallClient(over: Partial<HallClient> = {}): HallClient {
  return {
    commonRoom: vi.fn(async (kind) => ({ roomId: HALL_ROOM_ID, kind })),
    announcements: vi.fn(async () => ({
      announcements: [
        ANNOUNCEMENT(),
        ANNOUNCEMENT({
          id: 'n2',
          slug: 'longue',
          title: 'Une longue annonce',
          excerpt: 'Le début…',
          content: 'Le début.',
          contentTruncated: true,
          publishedAt: '2026-10-10T10:00:00.000Z',
        }),
      ],
    })),
    openRooms: vi.fn(async (cursor?: string | null) =>
      cursor === 'c1' ? PAGE_2 : PAGE_1
    ),
    ...over,
  } as HallClient;
}

const teamHqClient = {
  list: vi.fn(async () => ({
    teams: [
      {
        teamId: 't1',
        name: 'Les Valkyries',
        shortName: 'VAL',
        logoUrl: null,
        roomId: null,
      },
    ],
    lentInventoryIds: [],
  })),
  open: vi.fn(async (teamId: string) => ({
    roomId: 'q1',
    teamId,
    created: true,
  })),
} as unknown as TeamHqClient;

function wrap(children: ReactNode, hall: HallClient, library?: LibraryClient) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const inner = (
    <HallClientProvider client={hall}>
      <TeamHqClientProvider client={teamHqClient}>
        {children}
      </TeamHqClientProvider>
    </HallClientProvider>
  );
  return (
    <QueryClientProvider client={qc}>
      {library ? (
        <LibraryClientProvider client={library}>{inner}</LibraryClientProvider>
      ) : (
        inner
      )}
    </QueryClientProvider>
  );
}

const mountHall = (hall = makeHallClient(), navigate = vi.fn()) => {
  render(
    wrap(<HallExtras room={{ kind: 'hall' }} navigate={navigate} />, hall)
  );
  return { hall, navigate };
};

describe('HallExtras — rien hors du hall', () => {
  it('ne rend rien dans une autre salle, et ne lit rien', () => {
    const hall = makeHallClient();
    const { container } = render(
      wrap(<HallExtras room={{ kind: 'reading_room' }} />, hall)
    );
    expect(container.innerHTML).toBe('');
    expect(hall.announcements).not.toHaveBeenCalled();
  });
});

describe('le panneau d’annonces', () => {
  it('liste les annonces (titre, date, extrait), relues à l’entrée', async () => {
    const { hall } = mountHall();
    const list = await screen.findByText('Finale du 23/10');
    const item = list.closest('li') as HTMLElement;
    expect(
      within(item).getByText('Rendez-vous samedi sur Twitch !')
    ).toBeTruthy();
    expect(within(item).getByText(/Publiée le 15 octobre 2026/)).toBeTruthy();
    expect(hall.announcements).toHaveBeenCalledTimes(1);
  });

  it('« Lire » ouvre l’article dans un dialogue : Markdown rendu, HTML brut inerte, lien vers le site', async () => {
    mountHall();
    fireEvent.click(
      await screen.findByRole('button', {
        name: format(t.board.readAria, { title: 'Finale du 23/10' }),
      })
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Finale du 23/10' })
    ).toBeTruthy();
    const strong = await within(dialog).findByText('samedi');
    expect(strong.tagName).toBe('STRONG');
    expect(dialog.querySelector('script')).toBeNull();
    const twitch = within(dialog).getByRole('link', { name: 'Twitch' });
    expect(twitch.getAttribute('rel')).toBe('noopener noreferrer');
    const site = within(dialog).getByRole('link', { name: t.board.readOnSite });
    expect(site.getAttribute('href')).toBe('/news/finale-du-23-10');
    expect(within(dialog).queryByText(t.board.truncated)).toBeNull();

    // Retour à la liste, dans le même dialogue, puis Échap ferme.
    fireEvent.click(within(dialog).getByRole('button', { name: t.board.back }));
    await within(dialog).findByRole('heading', { name: t.board.title });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('une annonce coupée par l’API le dit', async () => {
    mountHall();
    fireEvent.click(
      await screen.findByRole('button', {
        name: format(t.board.readAria, { title: 'Une longue annonce' }),
      })
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(t.board.truncated)).toBeTruthy();
  });

  it('une lecture ratée se dit, et se relance', async () => {
    let fail = true;
    const hall = makeHallClient({
      announcements: vi.fn(async () => {
        // 4xx : pas de nouvel essai automatique (playerRetry).
        if (fail) throw new PlayerHttpError('panne', 409, { code: 'x' });
        return { announcements: [ANNOUNCEMENT()] };
      }),
    });
    mountHall(hall);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(t.board.error)).toBeTruthy();
    fail = false;
    fireEvent.click(within(alert).getByRole('button', { name: t.board.retry }));
    expect(await screen.findByText('Finale du 23/10')).toBeTruthy();
  });

  it('aucune annonce : le panneau le dit', async () => {
    mountHall(
      makeHallClient({
        announcements: vi.fn(async () => ({ announcements: [] })),
      })
    );
    expect(await screen.findByText(t.board.empty)).toBeTruthy();
  });
});

describe('le rendu Markdown d’une annonce', () => {
  it('ni balise brute, ni image chargée, ni lien `javascript:`', () => {
    const { container } = render(
      <AnnouncementMarkdown
        content={
          '<img src=x onerror=alert(1)> ![logo](https://cdn.example/x.png) [clic](javascript:alert(1))'
        }
      />
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    const link = screen.getByRole('link', { name: 'logo' });
    expect(link.getAttribute('href')).toBe('https://cdn.example/x.png');
    expect(screen.getByText('clic').getAttribute('href') ?? '').not.toContain(
      'javascript'
    );
  });
});

describe('les portes du hall', () => {
  it('la salle de lecture est un lieu (`?place=`), sans compter qui s’y trouve', async () => {
    mountHall();
    const doors = screen
      .getByRole('heading', { name: t.doors.title })
      .closest('section') as HTMLElement;
    const reading = within(doors)
      .getByText(t.doors.readingRoom)
      .closest('li') as HTMLElement;
    const enter = within(reading).getByRole('link', { name: t.doors.enter });
    expect(enter.getAttribute('href')).toBe(
      '/player/library?place=reading_room'
    );
    expect(reading.textContent).not.toMatch(/\d/);
  });

  it('les appartements ouverts : la liste par pages, « Entrer » mène à la salle', async () => {
    const { hall } = mountHall();
    fireEvent.click(screen.getByRole('button', { name: t.doors.open }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: t.apartments.title })
    ).toBeTruthy();
    const visit = await within(dialog).findByRole('link', {
      name: format(t.apartments.visitAria, { name: 'Le salon' }),
    });
    expect(visit.getAttribute('href')).toBe(`/player/library?room=${APT_1}`);
    expect(
      within(dialog).getByText(
        format(t.apartments.owner, { nickname: 'Soleil' })
      )
    ).toBeTruthy();

    fireEvent.click(
      within(dialog).getByRole('button', { name: t.apartments.more })
    );
    const second = await within(dialog).findByText(
      format(t.apartments.defaultName, { nickname: 'Etoile' })
    );
    expect(second).toBeTruthy();
    expect(hall.openRooms).toHaveBeenLastCalledWith('c1');
    expect(
      within(dialog).queryByRole('button', { name: t.apartments.more })
    ).toBeNull();
  });

  it('aucun appartement listé : la liste le dit', async () => {
    mountHall(
      makeHallClient({
        openRooms: vi.fn(async () => ({ rooms: [], nextCursor: null })),
      })
    );
    fireEvent.click(screen.getByRole('button', { name: t.doors.open }));
    expect(await screen.findByText(t.apartments.empty)).toBeTruthy();
  });

  it('« QG de mon équipe » ouvre la porte du lot 9, qui mène au QG', async () => {
    const { navigate } = mountHall();
    fireEvent.click(screen.getByRole('button', { name: t.doors.openTeamHq }));
    const dialog = await screen.findByRole('dialog', {
      name: nsTeamHq.fr.door.title,
    });
    fireEvent.click(
      await within(dialog).findByRole('button', {
        name: format(nsTeamHq.fr.door.enterAria, { team: 'Les Valkyries' }),
      })
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/player/library?room=q1')
    );
  });
});

describe('un appui sur une zone de la vue', () => {
  it('le panneau d’annonces s’ouvre ; la porte de la salle de lecture y mène', async () => {
    const { navigate } = mountHall();
    act(() => {
      requestHallSpot('board');
    });
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: t.board.title })
    ).toBeTruthy();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    act(() => {
      requestHallSpot('apartments');
    });
    expect(await screen.findByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    act(() => {
      requestHallSpot('reading_room');
    });
    expect(navigate).toHaveBeenCalledWith('/player/library?place=reading_room');
  });
});

describe('« Lieux »', () => {
  it('marque le lieu courant et mène aux lieux communs par `?place=`', () => {
    render(wrap(<PlacesNav current="hall" />, makeHallClient()));
    const nav = screen.getByRole('navigation', { name: t.places.navLabel });
    const hall = within(nav).getByRole('link', { name: t.places.hall });
    expect(hall.getAttribute('aria-current')).toBe('page');
    expect(hall.getAttribute('href')).toBe('/player/library?place=hall');
    const reading = within(nav).getByRole('link', {
      name: t.places.readingRoom,
    });
    expect(reading.getAttribute('href')).toBe(
      '/player/library?place=reading_room'
    );
    expect(reading.getAttribute('aria-current')).toBeNull();
    expect(
      within(nav)
        .getByRole('link', { name: t.places.apartment })
        .getAttribute('href')
    ).toBe('/player/library');
  });

  it('le QG ouvre la porte des QG de mes équipes (lot 9)', async () => {
    render(wrap(<PlacesNav current="apartment" />, makeHallClient()));
    fireEvent.click(screen.getByRole('button', { name: t.places.teamHq }));
    const dialog = await screen.findByRole('dialog', {
      name: nsTeamHq.fr.door.title,
    });
    expect(await within(dialog).findByText('Les Valkyries')).toBeTruthy();
  });
});

describe('`?place=` — PlaceScreen', () => {
  const meOk = {
    attested: true,
    attestedAt: '2026-10-01T08:00:00.000Z',
    avatar: { nickname: 'Lune', avatarId: 'a03', look: {} },
    inventory: [],
    inventoryTruncated: false,
    balance: 0,
  };

  it('porte franchie : la salle commune est trouvée, puis l’écran de la salle', async () => {
    const hall = makeHallClient();
    const library = { me: vi.fn(async () => meOk) } as unknown as LibraryClient;
    renderPlayer(wrap(<PlaceScreen place="hall" />, hall, library));
    const room = await screen.findByTestId('room-screen');
    expect(room.getAttribute('data-room')).toBe(HALL_ROOM_ID);
    expect(hall.commonRoom).toHaveBeenCalledTimes(1);
    expect(hall.commonRoom).toHaveBeenCalledWith('hall');
  });

  it('sans attestation : l’écran de la porte, et la salle n’est pas demandée', async () => {
    const hall = makeHallClient();
    const library = {
      me: vi.fn(async () => {
        throw new PlayerHttpError('refus', 403, {
          code: 'LIBRARY_ADULT_REQUIRED',
        });
      }),
    } as unknown as LibraryClient;
    renderPlayer(wrap(<PlaceScreen place="reading_room" />, hall, library));
    await waitFor(() =>
      expect(document.querySelector('[data-gate="attest"]')).not.toBeNull()
    );
    expect(hall.commonRoom).not.toHaveBeenCalled();
    expect(screen.queryByTestId('room-screen')).toBeNull();
  });

  it('une salle introuvable se dit, et se relance', async () => {
    let fail = true;
    const hall = makeHallClient({
      commonRoom: vi.fn(async (kind) => {
        if (fail) throw new PlayerHttpError('panne', 409, { code: 'x' });
        return { roomId: HALL_ROOM_ID, kind };
      }),
    });
    const library = { me: vi.fn(async () => meOk) } as unknown as LibraryClient;
    renderPlayer(wrap(<PlaceScreen place="hall" />, hall, library));
    const alert = await screen.findByRole('alert');
    fail = false;
    fireEvent.click(
      within(alert).getByRole('button', { name: t.placeScreen.retry })
    );
    expect(await screen.findByTestId('room-screen')).toBeTruthy();
  });
});

describe('réglages : « apparaître dans la liste du hall »', () => {
  const room = (over: Record<string, unknown> = {}) => ({
    id: 'apt',
    name: null,
    access: 'private' as const,
    listed: false,
    width: 14,
    depth: 12,
    decor: { floor: 'parquet' as const, wall: 'plain' as const },
    version: 0,
    ...over,
  });

  it('seulement pour un appartement ouvert ; l’enregistrement envoie l’accès et la liste', async () => {
    const onSave = vi.fn(async () => ({
      ok: true as const,
      data: { room: room() },
    }));
    render(
      wrap(
        <ApartmentSettings
          room={room() as never}
          saving={false}
          onSave={onSave as never}
        />,
        makeHallClient()
      )
    );
    const listed = screen.getByRole('checkbox', {
      name: 'Apparaître dans la liste du hall',
    });
    expect((listed as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Toutes les joueuses' }));
    expect((listed as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(listed);
    fireEvent.submit(listed.closest('form') as HTMLFormElement);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ access: 'open', listed: true })
    );
    expect(screen.queryByTestId('library-listed')).toBeNull();
  });

  it('listé (enregistré) : il le dit et mène au hall ; repasser en privé décoche', () => {
    render(
      wrap(
        <ApartmentSettings
          room={room({ access: 'open', listed: true }) as never}
          saving={false}
          onSave={vi.fn() as never}
        />,
        makeHallClient()
      )
    );
    const note = screen.getByTestId('library-listed');
    expect(note.textContent).toContain(t.settings.listedOn);
    expect(
      within(note)
        .getByRole('link', { name: t.settings.seeHall })
        .getAttribute('href')
    ).toBe('/player/library?place=hall');
    const listed = screen.getByRole('checkbox', {
      name: 'Apparaître dans la liste du hall',
    });
    expect((listed as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Moi seule' }));
    expect((listed as HTMLInputElement).checked).toBe(false);
    expect((listed as HTMLInputElement).disabled).toBe(true);
  });
});
