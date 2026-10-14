// @vitest-environment happy-dom
//
// StatsMvpPanel, vote DU PUBLIC : les deux gardes ajoutées le 2026-10-14.
//   - « Clore maintenant » demande confirmation en nommant le match : un vote
//     a été clos 8 s après son ouverture, d'un clic sur une liste qui venait
//     de se réordonner ;
//   - une ouverture dont l'abonnement au chat Twitch n'a pas pris le DIT : le
//     statut était jeté, et 0 voix Twitch passait inaperçu.

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
const confirm = vi.fn();
const refetch = vi.fn(async () => undefined);

vi.mock('next/router', () => ({ useRouter: () => ({ query: {} }) }));
vi.mock('@/utils/admin/adminHttp', () => ({
  adminRequest: (...args: unknown[]) => adminRequest(...args),
}));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ addToast }) }));
vi.mock('@/hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({ confirm, dialog: null }),
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

const board = {
  tournament: { id: 'tour-1', name: 'Cup' },
  openable: [],
  totals: { votes: 7, openPolls: 1, matchesWithVotes: 2 },
  matches: [
    {
      id: 'm-open',
      roundName: 'J4',
      scheduledAt: '2026-10-14T20:00:00.000Z',
      status: 'ongoing',
      team1Name: 'Alpha',
      team2Name: 'Beta',
      state: 'open',
      closesAt: '2026-10-15T00:00:00.000Z',
      closedAt: null,
      totalVotes: 7,
      sources: [],
      leader: { memberId: null, reason: 'no_votes' },
      winner: null,
    },
    {
      id: 'm-closed',
      roundName: 'J3',
      scheduledAt: '2026-10-09T20:00:00.000Z',
      status: 'finished',
      team1Name: 'Gamma',
      team2Name: 'Delta',
      state: 'closed',
      closesAt: null,
      closedAt: '2026-10-09T22:00:00.000Z',
      totalVotes: 0,
      sources: [],
      leader: { memberId: null, reason: 'no_votes' },
      winner: null,
    },
  ],
};

vi.mock('@/features/admin/tournaments/hooks/useTournamentRead', () => ({
  useTournamentRead: () => ({
    data: board,
    isPending: false,
    error: null,
    refetch,
  }),
}));

import StatsMvpPanel from '../../components/admin/tournament/StatsMvpPanel';
import ns from '../../lib/i18n/locales/admin-fr/adminTournamentMvpVotes';

const t = ns.fr;

beforeEach(() => {
  adminRequest.mockReset();
  addToast.mockReset();
  confirm.mockReset();
});
afterEach(cleanup);

describe('StatsMvpPanel — vote du public', () => {
  it('« Clore maintenant » demande confirmation en nommant le match ; refusée, rien ne part', async () => {
    confirm.mockResolvedValue(false);
    render(<StatsMvpPanel kind="public" tournamentId="tour-1" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.closeCta }));
    });

    expect(confirm).toHaveBeenCalledOnce();
    const opts = confirm.mock.calls[0][0] as { subtitle: string };
    expect(opts.subtitle).toContain('Alpha');
    expect(opts.subtitle).toContain('Beta');
    expect(opts.subtitle).toContain('7 voix');
    expect(adminRequest).not.toHaveBeenCalled();
  });

  it('confirmée, la clôture part sur CE match', async () => {
    confirm.mockResolvedValue(true);
    adminRequest.mockResolvedValue({ success: true });
    render(<StatsMvpPanel kind="public" tournamentId="tour-1" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.closeCta }));
    });

    expect(adminRequest).toHaveBeenCalledOnce();
    const [url, init] = adminRequest.mock.calls[0] as [
      string,
      { json: unknown },
    ];
    expect(url).toContain('m-open');
    expect(init.json).toEqual({ action: 'close' });
    expect(addToast).toHaveBeenCalledWith(t.closeDone, 'success');
  });

  it('une ouverture dont le chat Twitch ne vote pas l’annonce', async () => {
    confirm.mockResolvedValue(true);
    adminRequest.mockResolvedValue({ twitchChat: 'missing_scope' });
    render(<StatsMvpPanel kind="public" tournamentId="tour-1" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.reopenCta }));
    });

    expect(addToast).toHaveBeenCalledWith(t.reopenDone, 'success');
    expect(addToast).toHaveBeenCalledWith(t.twitchChatMissingScope, 'warning');
  });

  it('chat Twitch abonné : pas d’avertissement', async () => {
    confirm.mockResolvedValue(true);
    adminRequest.mockResolvedValue({ twitchChat: 'subscribed' });
    render(<StatsMvpPanel kind="public" tournamentId="tour-1" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.reopenCta }));
    });

    expect(addToast).toHaveBeenCalledTimes(1);
    expect(addToast).toHaveBeenCalledWith(t.reopenDone, 'success');
  });
});
