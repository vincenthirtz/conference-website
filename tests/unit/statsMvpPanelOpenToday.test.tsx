// @vitest-environment happy-dom
//
// StatsMvpPanel, « Lancer un vote du public » : la liste montre LES MATCHS DU
// JOUR. L'API rend tout le tournoi — en cours, puis terminés du plus récent au
// plus ancien, puis à venir — et le soir des finales (2026-10-23), les deux
// affiches du jour arrivaient sous toute la saison jouée.
//
// CE QUE CES CAS PROTÈGENT :
//   - le jour est celui de Paris, dans l'ordre du programme ; un match encore
//     en cours reste, même commencé la veille ;
//   - « Tous les matchs du tournoi » rend la liste complète ;
//   - un jour sans match : la liste complète d'emblée, et on le dit ;
//   - on ne lance jamais un match qui n'est plus affiché.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';

const adminRequest = vi.fn();
const addToast = vi.fn();

vi.mock('next/router', () => ({ useRouter: () => ({ query: {} }) }));
vi.mock('@/utils/admin/adminHttp', () => ({
  adminRequest: (...args: unknown[]) => adminRequest(...args),
}));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ addToast }) }));
vi.mock('@/hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({ confirm: vi.fn(), dialog: null }),
}));
vi.mock('@/hooks/useDocumentVisible', () => ({
  useDocumentVisible: () => true,
}));
vi.mock('@/lib/i18n/useLocale', () => ({ useLocale: () => 'fr' }));
vi.mock('@/lib/i18n/useAdminT', async () => {
  const real =
    await vi.importActual<typeof import('@/lib/i18n/useT')>('@/lib/i18n/useT');
  return {
    useAdminT: (ns: { fr: unknown }) => ns.fr,
    format: real.format,
  };
});

type Openable = {
  id: string;
  status: string;
  roundName: string | null;
  scheduledAt: string | null;
  team1Name: string;
  team2Name: string;
};

function openable(
  id: string,
  status: string,
  scheduledAt: string | null,
  teams: [string, string]
): Openable {
  return {
    id,
    status,
    roundName: null,
    scheduledAt,
    team1Name: teams[0],
    team2Name: teams[1],
  };
}

// Vendredi 23 octobre 2026, midi à Paris (CEST = UTC+2).
const NOW = new Date('2026-10-23T10:00:00.000Z');

// Dans l'ordre de l'API : en cours, terminés (récents d'abord), à venir.
const SEASON: Openable[] = [
  openable('m-late', 'ongoing', '2026-10-22T21:30:00.000Z', [
    'Nuit',
    'Tardive',
  ]),
  openable('m-old', 'finished', '2026-10-16T18:30:00.000Z', ['Gamma', 'Delta']),
  openable('m-older', 'finished', '2026-09-18T18:30:00.000Z', ['Epsi', 'Zeta']),
  openable('m-small', 'pending', '2026-10-23T17:00:00.000Z', [
    'LVN EMBERS',
    'Venom Valkyries',
  ]),
  openable('m-grand', 'pending', '2026-10-23T18:30:00.000Z', [
    'Hinode Sparkles',
    'Chocomates',
  ]),
  openable('m-next', 'pending', '2026-10-30T18:00:00.000Z', [
    'Demain',
    'Plus tard',
  ]),
];

let board: Record<string, unknown>;
function setBoard(list: Openable[]) {
  board = {
    tournament: { id: 'tour-1', name: 'Cup' },
    openable: list,
    totals: { votes: 0, openPolls: 0, matchesWithVotes: 0 },
    matches: [],
  };
}

vi.mock('@/features/admin/tournaments/hooks/useTournamentRead', () => ({
  useTournamentRead: () => ({
    data: board,
    isPending: false,
    error: null,
    refetch: vi.fn(async () => undefined),
  }),
}));

import StatsMvpPanel from '../../components/admin/tournament/StatsMvpPanel';
import { openableOfDay } from '../../components/admin/tournament/MvpPublicLaunch';
import ns from '../../lib/i18n/locales/admin-fr/adminTournamentMvpVotes';

const t = ns.fr;

function optionTexts(): string[] {
  const select = screen.getByLabelText(t.openMatchLabel) as HTMLSelectElement;
  return Array.from(select.options)
    .map((o) => o.textContent ?? '')
    .filter((s) => s !== '—');
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  adminRequest.mockReset();
  addToast.mockReset();
  setBoard(SEASON);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('openableOfDay', () => {
  it('garde le jour de Paris et le match encore en cours, dans l’ordre du programme', () => {
    expect(openableOfDay(SEASON, NOW).map((m) => m.id)).toEqual([
      'm-late',
      'm-small',
      'm-grand',
    ]);
  });

  it('rend une liste vide un jour sans match', () => {
    expect(
      openableOfDay(SEASON, new Date('2026-10-25T10:00:00.000Z')).filter(
        (m) => m.status !== 'ongoing'
      )
    ).toEqual([]);
  });
});

describe('Lancer un vote du public — les matchs du jour', () => {
  it('ne liste que les matchs du jour, la petite finale avant la grande', () => {
    render(<StatsMvpPanel kind="public" tournamentId="tour-1" />);
    const options = optionTexts();
    expect(options).toHaveLength(3);
    expect(options[1]).toContain('LVN EMBERS');
    expect(options[2]).toContain('Hinode Sparkles');
    expect(options.join(' ')).not.toContain('Gamma');
  });

  it('« Tous les matchs du tournoi » rend la liste complète', () => {
    render(<StatsMvpPanel kind="public" tournamentId="tour-1" />);
    fireEvent.click(
      screen.getByLabelText(t.openShowAll.replace('{count}', '6'))
    );
    expect(optionTexts()).toHaveLength(6);
  });

  it('lance le vote du match choisi', async () => {
    adminRequest.mockResolvedValue({ twitchChat: 'subscribed' });
    render(<StatsMvpPanel kind="public" tournamentId="tour-1" />);
    fireEvent.change(screen.getByLabelText(t.openMatchLabel), {
      target: { value: 'm-grand' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.openCta }));
    });
    const [url, init] = adminRequest.mock.calls[0] as [
      string,
      { json: unknown },
    ];
    expect(url).toContain('m-grand');
    expect(init.json).toEqual({ action: 'open' });
  });

  it('ne lance pas un match qui n’est plus affiché', () => {
    render(<StatsMvpPanel kind="public" tournamentId="tour-1" />);
    const toggle = screen.getByLabelText(t.openShowAll.replace('{count}', '6'));
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText(t.openMatchLabel), {
      target: { value: 'm-older' },
    });
    // Retour au jour même : le match de septembre n'est plus dans la liste.
    fireEvent.click(toggle);
    expect(
      screen.getByRole('button', { name: t.openCta }).hasAttribute('disabled')
    ).toBe(true);
  });

  it('un jour sans match : tout le tournoi d’emblée, et on le dit', () => {
    setBoard(SEASON.filter((m) => m.status !== 'ongoing'));
    vi.setSystemTime(new Date('2026-10-25T10:00:00.000Z'));
    render(<StatsMvpPanel kind="public" tournamentId="tour-1" />);
    expect(screen.getByText(t.openNoneToday)).toBeTruthy();
    expect(optionTexts()).toHaveLength(5);
  });
});
