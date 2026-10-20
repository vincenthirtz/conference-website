// @vitest-environment happy-dom
//
// Women's Library, lot 9 — le panneau d'un QG d'équipe (`ui/teamHq/
// TeamHqPanel`, monté sous la salle par `RoomExtras`) et la porte « QG de mon
// équipe » (`ui/teamHq/TeamHqDoor`), contre un client EN MÉMOIRE qui rend des
// RÉPONSES fixes de l'API (les routes sont testées dans conference-api) :
//   * rien hors d'un QG ;
//   * le prochain match (les données du tableau de bord) et la porte vers le
//     salon Discord (nouvel onglet, `noopener`) ;
//   * prêter un meuble : sans position (première place libre), l'issue dite,
//     la salle à recharger ; un refus traduit par son `code` ;
//   * déplacer SANS canevas : le formulaire dit avant l'envoi si le meuble
//     tient, et n'envoie qu'une place valable ;
//   * rendre : la capitaine voit « Rendre » sur le meuble d'une autre, une
//     simple membre non ; le staff entre sans prêter ;
//   * la porte ouvre le QG (créé au besoin) puis mène à la salle.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
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
const reload = vi.hoisted(() => vi.fn());
vi.mock('next/router', () => ({
  default: { asPath: '/player/library', push, reload },
  useRouter: () => ({ asPath: '/player/library', query: {}, push, reload }),
}));

import TeamHqPanel from '../../features/player/library/ui/teamHq/TeamHqPanel';
import TeamHqDoor from '../../features/player/library/ui/teamHq/TeamHqDoor';
import {
  type LibraryClient,
  LibraryClientProvider,
} from '../../features/player/library/clientContext';
import { TeamHqClientProvider } from '../../features/player/library/teamHq/clientContext';
import type { TeamHqClient } from '../../features/player/library/teamHq/client';
import type {
  LibraryLentItem,
  LibraryTeamHqSummaryResponse,
} from '../../features/player/library/teamHqResponses';
import { PlayerHttpError } from '../../utils/player/playerHttp';
import nsTeamHq from '../../lib/i18n/locales/fr/playerLibraryTeamHq';
import { format } from '../../lib/i18n/useT';

afterEach(() => {
  cleanup();
  push.mockClear();
  reload.mockClear();
});

const t = nsTeamHq.fr;
const ROOM = '00000000-0000-4000-8000-0000000000a1';
const TEAM = '00000000-0000-4000-8000-0000000000b1';
const MY_CHAIR = '00000000-0000-4000-8000-0000000000c1';
const HER_SOFA = '00000000-0000-4000-8000-0000000000c2';
const MY_ARMCHAIR = '00000000-0000-4000-8000-0000000000c3';

const CATALOG = {
  tileSizeM: 0.5,
  rotations: 4,
  avatars: ['a01'],
  furniture: [
    ['chair', 1, 1],
    ['armchair', 2, 2],
    ['sofa', 3, 2],
  ].map(([key, w, d]) => ({
    key: key as string,
    category: 'seating' as const,
    footprint: { w: w as number, d: d as number },
    heightM: 1,
    price: 50,
    sittable: true,
    stackable: false,
    layer: 'object' as const,
  })),
};

const ITEM = (over: Partial<LibraryLentItem>): LibraryLentItem => ({
  inventoryId: MY_CHAIR,
  key: 'chair',
  gx: 0,
  gy: 0,
  rotation: 0,
  ownerUserId: 'me',
  ownerNickname: 'Lune',
  mine: true,
  ...over,
});

function makeSummary(
  over: Partial<LibraryTeamHqSummaryResponse> = {}
): LibraryTeamHqSummaryResponse {
  return {
    roomId: ROOM,
    version: 4,
    width: 20,
    depth: 16,
    team: {
      id: TEAM,
      name: 'Les Valkyries',
      shortName: 'VAL',
      logoUrl: null,
      slug: 'les-valkyries',
    },
    nextMatch: {
      id: 'm1',
      scheduledAt: '2026-10-23T18:00:00.000Z',
      status: 'pending',
      roundName: 'Finale',
      bestOf: 3,
      streamUrl: null,
      opponent: { id: 'o1', name: 'Aurores' },
      tournament: { id: 't1', name: 'Cup 2026', slug: 'cup-2026' },
      checkin: {
        opensAt: null,
        isOpen: true,
        isPassed: false,
        alreadyCheckedIn: false,
      },
    },
    discordUrl:
      'https://discord.com/channels/111111111111111111/222222222222222222',
    items: [
      ITEM({}),
      ITEM({
        inventoryId: HER_SOFA,
        key: 'sofa',
        gx: 4,
        gy: 4,
        ownerUserId: 'her',
        ownerNickname: 'Soleil',
        mine: false,
      }),
    ],
    lendable: [{ inventoryId: MY_ARMCHAIR, key: 'armchair' }],
    me: { member: true, staff: false, canReturnAny: false },
    ...over,
  };
}

function makeClient(
  summary: LibraryTeamHqSummaryResponse,
  over: Partial<TeamHqClient> = {}
): TeamHqClient {
  return {
    list: vi.fn(async () => ({
      teams: [
        {
          teamId: TEAM,
          name: 'Les Valkyries',
          shortName: 'VAL',
          logoUrl: null,
          roomId: null,
        },
      ],
      lentInventoryIds: [],
    })),
    open: vi.fn(async (teamId: string) => ({
      roomId: ROOM,
      teamId,
      created: true,
    })),
    summary: vi.fn(async () => summary),
    lend: vi.fn(async (_roomId: string, input) => ({
      version: 5,
      moved: input.gx !== undefined,
      item: ITEM({
        inventoryId: input.inventoryId,
        key: input.inventoryId === MY_ARMCHAIR ? 'armchair' : 'chair',
        gx: input.gx ?? 6,
        gy: input.gy ?? 0,
        rotation: input.rotation ?? 0,
      }),
    })),
    giveBack: vi.fn(async (_roomId: string, inventoryId: string) => ({
      returned: true as const,
      inventoryId,
      version: 5,
    })),
    ...over,
  };
}

const libraryClient = {
  catalog: vi.fn(async () => CATALOG),
} as unknown as LibraryClient;

function wrap(children: ReactNode, client: TeamHqClient) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <LibraryClientProvider client={libraryClient}>
        <TeamHqClientProvider client={client}>{children}</TeamHqClientProvider>
      </LibraryClientProvider>
    </QueryClientProvider>
  );
}

async function mountPanel(
  summary = makeSummary(),
  over: Partial<TeamHqClient> = {}
) {
  const client = makeClient(summary, over);
  const onReloadRoom = vi.fn();
  render(
    wrap(
      <TeamHqPanel
        room={{ id: ROOM, kind: 'team_hq' }}
        onReloadRoom={onReloadRoom}
      />,
      client
    )
  );
  await screen.findByRole('heading', {
    name: format(t.panel.title, { team: 'Les Valkyries' }),
  });
  return { client, onReloadRoom };
}

describe('TeamHqPanel — le panneau sous la salle', () => {
  it('sans cache joueuse (RoomExtras monté nu) : rien, sans lever', () => {
    const { container } = render(
      <TeamHqPanel room={{ id: ROOM, kind: 'team_hq' }} />
    );
    expect(container.innerHTML).toBe('');
    const door = render(<TeamHqDoor />);
    expect(door.container.innerHTML).toBe('');
  });

  it('ne rend rien hors d’un QG', () => {
    const client = makeClient(makeSummary());
    const { container } = render(
      wrap(<TeamHqPanel room={{ id: ROOM, kind: 'hall' }} />, client)
    );
    expect(container.innerHTML).toBe('');
    expect(client.summary).not.toHaveBeenCalled();
  });

  it('le prochain match et la porte vers le salon Discord (nouvel onglet)', async () => {
    await mountPanel();
    expect(
      screen.getByText(
        format(t.match.versus, { team: 'Les Valkyries', opponent: 'Aurores' })
      )
    ).toBeTruthy();
    expect(screen.getByText('Cup 2026 · Finale')).toBeTruthy();
    expect(screen.getByText(format(t.match.bestOf, { n: 3 }))).toBeTruthy();
    expect(screen.getByText(t.match.checkinOpen)).toBeTruthy();
    const discord = screen.getByRole('link', { name: t.discord.openAria });
    expect(discord.getAttribute('href')).toBe(
      'https://discord.com/channels/111111111111111111/222222222222222222'
    );
    expect(discord.getAttribute('target')).toBe('_blank');
    expect(discord.getAttribute('rel')).toContain('noopener');
  });

  it('sans match ni salon : le panneau le dit, sans bloquer', async () => {
    await mountPanel(makeSummary({ nextMatch: null, discordUrl: null }));
    expect(screen.getByText(t.match.none)).toBeTruthy();
    expect(screen.getByText(t.discord.none)).toBeTruthy();
  });

  it('les meubles prêtés et leur prêteuse ; une simple membre ne rend pas ceux des autres', async () => {
    await mountPanel();
    const list = screen
      .getByText(t.furniture.title)
      .closest('section') as HTMLElement;
    const mine = within(list).getByText('Chaise').closest('li') as HTMLElement;
    expect(within(mine).getByText(/Prêté par toi/)).toBeTruthy();
    expect(
      within(mine).getByRole('button', { name: 'Déplacer Chaise' })
    ).toBeTruthy();
    expect(
      within(mine).getByRole('button', { name: 'Reprendre Chaise' })
    ).toBeTruthy();
    const hers = within(list).getByText('Canapé').closest('li') as HTMLElement;
    expect(within(hers).getByText(/Prêté par Soleil/)).toBeTruthy();
    expect(within(hers).queryAllByRole('button')).toHaveLength(0);
  });

  it('prêter : sans position, l’issue dite, la salle à recharger', async () => {
    const { client, onReloadRoom } = await mountPanel();
    fireEvent.click(
      screen.getByRole('button', { name: 'Prêter Fauteuil au QG' })
    );
    await screen.findByText(
      format(t.furniture.done.lent, { name: 'Fauteuil' })
    );
    expect(client.lend).toHaveBeenCalledWith(ROOM, {
      inventoryId: MY_ARMCHAIR,
    });
    // Le panneau est relu (un prêt dont la réponse se perd apparaît quand même).
    await waitFor(() => expect(client.summary).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: t.furniture.refresh }));
    expect(onReloadRoom).toHaveBeenCalledTimes(1);
  });

  it('un refus est traduit par son code', async () => {
    await mountPanel(makeSummary(), {
      lend: vi.fn(async () => {
        throw new PlayerHttpError('refus', 409, {
          error: 'refus',
          code: 'team_hq_no_space',
        });
      }),
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Prêter Fauteuil au QG' })
    );
    await screen.findByText(t.codes.team_hq_no_space);
    expect(
      screen.queryByRole('button', { name: t.furniture.refresh })
    ).toBeNull();
  });

  it('déplacer sans canevas : le formulaire juge la place avant l’envoi', async () => {
    const { client } = await mountPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer Chaise' }));
    const form = screen
      .getByText(format(t.move.title, { name: 'Chaise' }))
      .closest('form') as HTMLFormElement;
    const gx = within(form).getByLabelText(format(t.move.gx, { max: 19 }));
    const gy = within(form).getByLabelText(format(t.move.gy, { max: 15 }));
    const submit = within(form).getByRole('button', { name: t.move.submit });

    // Sur le canapé de Soleil (4..6, 4..5) : refusé avant l'envoi.
    fireEvent.change(gx, { target: { value: '5' } });
    fireEvent.change(gy, { target: { value: '5' } });
    expect(
      within(form).getByRole('status').getAttribute('data-move-valid')
    ).toBe('false');
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    // Hors de la salle.
    fireEvent.change(gx, { target: { value: '20' } });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    // Une place libre, un quart de tour.
    fireEvent.change(gx, { target: { value: '9' } });
    fireEvent.change(gy, { target: { value: '3' } });
    fireEvent.change(within(form).getByLabelText(t.move.rotation), {
      target: { value: '1' },
    });
    expect(within(form).getByText(t.move.valid)).toBeTruthy();
    fireEvent.click(submit);
    await screen.findByText(format(t.furniture.done.moved, { name: 'Chaise' }));
    expect(client.lend).toHaveBeenCalledWith(ROOM, {
      inventoryId: MY_CHAIR,
      gx: 9,
      gy: 3,
      rotation: 1,
    });
  });

  it('reprendre mon meuble', async () => {
    const { client } = await mountPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Reprendre Chaise' }));
    await screen.findByText(
      format(t.furniture.done.returned, { name: 'Chaise' })
    );
    expect(client.giveBack).toHaveBeenCalledWith(ROOM, MY_CHAIR);
  });

  it('la capitaine rend le meuble d’une autre à sa propriétaire', async () => {
    const { client } = await mountPanel(
      makeSummary({ me: { member: true, staff: false, canReturnAny: true } })
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: format(t.furniture.giveBackAria, { name: 'Canapé' }),
      })
    );
    await waitFor(() =>
      expect(client.giveBack).toHaveBeenCalledWith(ROOM, HER_SOFA)
    );
  });

  it('le staff entre sans prêter', async () => {
    await mountPanel(
      makeSummary({
        items: [],
        lendable: [],
        me: { member: false, staff: true, canReturnAny: false },
      })
    );
    expect(screen.getByText(t.panel.staffNote)).toBeTruthy();
    expect(screen.getByText(t.codes.team_hq_members_only)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Prêter/ })).toBeNull();
  });

  it('un panneau illisible : l’erreur, et « Réessayer »', async () => {
    const client = makeClient(makeSummary(), {
      summary: vi.fn(async () => {
        throw new PlayerHttpError('refus', 403, {
          error: 'refus',
          code: 'room_forbidden',
        });
      }),
    });
    render(wrap(<TeamHqPanel room={{ id: ROOM, kind: 'team_hq' }} />, client));
    await screen.findByText(t.panel.error);
    fireEvent.click(screen.getByRole('button', { name: t.panel.retry }));
    await waitFor(() => expect(client.summary).toHaveBeenCalledTimes(2));
  });
});

describe('TeamHqDoor — « QG de mon équipe »', () => {
  it('ouvre le QG (créé au besoin) puis mène à la salle', async () => {
    const client = makeClient(makeSummary());
    const onNavigate = vi.fn();
    render(wrap(<TeamHqDoor onNavigate={onNavigate} />, client));
    expect(await screen.findByText(t.door.notCreated)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', {
        name: format(t.door.enterAria, { team: 'Les Valkyries' }),
      })
    );
    await waitFor(() =>
      expect(onNavigate).toHaveBeenCalledWith(`/player/library?room=${ROOM}`)
    );
    expect(client.open).toHaveBeenCalledWith(TEAM);
  });

  it('sans navigation fournie : le routeur', async () => {
    render(wrap(<TeamHqDoor />, makeClient(makeSummary())));
    fireEvent.click(
      await screen.findByRole('button', {
        name: format(t.door.enterAria, { team: 'Les Valkyries' }),
      })
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/player/library?room=${ROOM}`)
    );
  });

  it('aucune équipe : le dire, et proposer d’en rejoindre une', async () => {
    const client = makeClient(makeSummary(), {
      list: vi.fn(async () => ({ teams: [], lentInventoryIds: [] })),
    });
    render(wrap(<TeamHqDoor />, client));
    expect(await screen.findByText(t.door.none, { exact: false })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: t.door.joinLink }).getAttribute('href')
    ).toBe('/player/join-team');
  });

  it('un refus à l’ouverture est dit, rien n’est ouvert', async () => {
    const client = makeClient(makeSummary(), {
      open: vi.fn(async () => {
        throw new PlayerHttpError('refus', 403, {
          error: 'refus',
          code: 'room_forbidden',
        });
      }),
    });
    const onNavigate = vi.fn();
    render(wrap(<TeamHqDoor onNavigate={onNavigate} />, client));
    fireEvent.click(
      await screen.findByRole('button', {
        name: format(t.door.enterAria, { team: 'Les Valkyries' }),
      })
    );
    expect(await screen.findByText(t.codes.room_forbidden)).toBeTruthy();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('porte fermée de la Library (`enabled: false`) : rien n’est lu', () => {
    const client = makeClient(makeSummary());
    render(wrap(<TeamHqDoor enabled={false} />, client));
    expect(client.list).not.toHaveBeenCalled();
  });
});
