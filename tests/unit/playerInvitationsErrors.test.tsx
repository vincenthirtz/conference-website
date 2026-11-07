// @vitest-environment happy-dom
//
// Invitations reçues (lot 1) : un 409 ne dit plus toujours « Tu fais déjà
// partie d'une équipe ». Le `code` du refus (contrat C8) sépare « déjà dans
// une équipe » de « invitation déjà traitée » ; sans code, message générique.
// Et la confirmation ne promet plus qu'on quittera son équipe.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import nsPlayerNotifications from '@/lib/i18n/locales/fr/playerNotifications';
import nsPlayerNotificationsEn from '@/lib/i18n/locales/en/playerNotifications';

const { adminFetchJson, addToast } = vi.hoisted(() => ({
  adminFetchJson: vi.fn(),
  addToast: vi.fn(),
}));

vi.mock('@/hooks/useAdminFetch', async (orig) => {
  const actual = await orig<typeof import('@/hooks/useAdminFetch')>();
  return { ...actual, useAdminFetch: () => ({ adminFetchJson }) };
});
vi.mock('@/components/Toast', () => ({ useToast: () => ({ addToast }) }));

import { AdminFetchError } from '@/hooks/useAdminFetch';
import InvitationsSection, {
  invitationErrorCode,
} from '@/components/player/InvitationsSection';

const t = nsPlayerNotifications.fr;

const INVITE = {
  id: 'inv-1',
  teamId: 'team-1',
  teamName: 'Les Autres',
  role: 'player',
  specialty: null,
  battleTag: null,
  expiresAt: null,
  createdAt: '2026-11-01T10:00:00Z',
};

function setup(error: unknown) {
  adminFetchJson.mockImplementation(
    async (_url: string, init?: { method?: string }) => {
      if (init?.method !== 'POST') return { invitations: [INVITE] };
      throw error;
    }
  );
  render(<InvitationsSection />);
}

afterEach(() => {
  cleanup();
  adminFetchJson.mockReset();
  addToast.mockReset();
});

async function decline() {
  fireEvent.click(await screen.findByText(t.declineInvite));
  await waitFor(() => expect(addToast).toHaveBeenCalled());
  return addToast.mock.calls[0];
}

describe('invitations — 409 par code', () => {
  it('already_in_team → déjà dans une équipe', async () => {
    setup(
      new AdminFetchError('x', 409, { error: 'x', code: 'already_in_team' })
    );
    expect(await decline()).toEqual([t.alreadyInTeam, 'error']);
    // L'invitation reste : quitter son équipe la rend acceptable.
    expect(screen.queryByText('Les Autres')).toBeTruthy();
  });

  it('invitation_already_processed → message distinct, carte retirée', async () => {
    setup(
      new AdminFetchError('x', 409, {
        error: 'x',
        code: 'invitation_already_processed',
      })
    );
    expect(await decline()).toEqual([t.inviteAlreadyProcessed, 'error']);
    await waitFor(() => expect(screen.queryByText('Les Autres')).toBeNull());
  });

  it('409 sans code → message générique', async () => {
    setup(new AdminFetchError('x', 409, { error: 'x' }));
    expect(await decline()).toEqual([t.inviteError, 'error']);
  });
});

describe('invitationErrorCode', () => {
  it('lit le code à plat ou sous `error`', () => {
    expect(invitationErrorCode({ code: 'already_in_team' })).toBe(
      'already_in_team'
    );
    expect(
      invitationErrorCode({ error: { code: 'invitation_already_processed' } })
    ).toBe('invitation_already_processed');
    expect(invitationErrorCode(null)).toBeNull();
    expect(invitationErrorCode('boom')).toBeNull();
  });
});

describe('confirmation d’acceptation', () => {
  it('ne promet plus de quitter son équipe (règle d’une seule équipe)', () => {
    expect(t.inviteConfirmSubtitle).not.toMatch(/quitteras/);
    expect(nsPlayerNotificationsEn.inviteConfirmSubtitle).not.toMatch(
      /you will leave it/
    );
  });
});
