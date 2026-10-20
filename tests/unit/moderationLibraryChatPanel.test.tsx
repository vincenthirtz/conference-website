// @vitest-environment happy-dom
//
// Onglet « Library » de /admin/moderation — le CHAT de la Women's Library
// (lot 6), côté écran, contre des réponses figées de `/api/admin/library/*`
// (les routes sont testées dans conference-api ; formes de
// `features/admin/library/chatModel.ts`, copie synchronisée).
//
// Ce que ces cas protègent : l'interrupteur dit l'état et ne bascule
// qu'après confirmation ; les messages récents disent où, qui, quoi (texte
// brut), masqués compris ; masquer et mettre en sourdine passent par l'API —
// motif obligatoire, durée et portée (salle ou partout) envoyées ; une
// sourdine se lève après confirmation.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import nsAdminModerationLibrary from '@/lib/i18n/locales/admin-fr/adminModerationLibrary';
import { format } from '@/lib/i18n/useAdminT';
import type {
  AdminLibraryChatMessage,
  AdminLibraryMuteItem,
} from '@/features/admin/library/chatModel';

const { adminRequest, addToast } = vi.hoisted(() => ({
  adminRequest: vi.fn(),
  addToast: vi.fn(),
}));
vi.mock('@/utils/admin/adminHttp', () => ({
  adminRequest,
  adminErrorMessage: (_err: unknown, fallback: string) => fallback,
}));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ addToast }) }));

import LibraryChatSwitch from '@/components/admin/moderation/LibraryChatSwitch';
import LibraryChatMessagesPanel from '@/components/admin/moderation/LibraryChatMessagesPanel';
import LibraryChatMutesList from '@/components/admin/moderation/LibraryChatMutesList';

const t = nsAdminModerationLibrary.fr;
const HALL = '00000000-0000-4000-8000-0000000000a1';
const FLAT = '00000000-0000-4000-8000-0000000000a2';
const LUNE = '11111111-1111-4111-8111-111111111111';
const SOLEIL = '22222222-2222-4222-8222-222222222222';

const M1: AdminLibraryChatMessage = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  roomId: HALL,
  roomKind: 'hall',
  roomName: null,
  roomOwnerNickname: null,
  userId: LUNE,
  nickname: 'Lune',
  body: 'tu es nulle <b>vraiment</b>',
  createdAt: '2026-10-20T18:00:00.000Z',
  hiddenAt: null,
};
const M2: AdminLibraryChatMessage = {
  ...M1,
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
  roomId: FLAT,
  roomKind: 'apartment',
  roomOwnerNickname: 'Soleil',
  userId: SOLEIL,
  nickname: 'Soleil',
  body: 'déjà masqué',
  hiddenAt: '2026-10-20T18:05:00.000Z',
};
const MUTE: AdminLibraryMuteItem = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
  userId: LUNE,
  nickname: 'Lune',
  roomId: null,
  roomKind: null,
  until: '2026-10-21T18:00:00.000Z',
  reason: 'insultes',
  createdAt: '2026-10-20T18:00:00.000Z',
  byUserId: null,
};

type Init = { method?: string; json?: any };

let enabled = false;
function routeApi() {
  adminRequest.mockImplementation((url: string, init?: Init) => {
    const method = init?.method ?? 'GET';
    if (url.startsWith('/api/admin/library/chat-settings')) {
      if (method === 'PUT') enabled = init?.json?.enabled === true;
      return Promise.resolve({ enabled });
    }
    if (url.startsWith('/api/admin/library/messages/hide')) {
      return Promise.resolve({
        id: init?.json?.messageId,
        hidden: true,
        alreadyHidden: false,
      });
    }
    if (url.startsWith('/api/admin/library/messages')) {
      return Promise.resolve({
        items: [M1, M2],
        nextCursor: null,
        chatEnabled: enabled,
      });
    }
    if (url.startsWith('/api/admin/library/mutes')) {
      if (method === 'POST') {
        return Promise.resolve({
          mute: { ...MUTE, roomId: init?.json?.roomId ?? null },
        });
      }
      if (method === 'DELETE')
        return Promise.resolve({ id: MUTE.id, lifted: true });
      return Promise.resolve({ items: [MUTE] });
    }
    return Promise.reject(new Error(`inattendu : ${method} ${url}`));
  });
}

function wrap(node: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

const calls = (method: string, prefix: string) =>
  adminRequest.mock.calls.filter(
    (c) =>
      ((c[1] as Init | undefined)?.method ?? 'GET') === method &&
      String(c[0]).startsWith(prefix)
  );

beforeEach(() => {
  enabled = false;
  adminRequest.mockReset();
  addToast.mockReset();
  routeApi();
});
afterEach(cleanup);

describe('LibraryChatSwitch', () => {
  it('fermé par défaut ; s’ouvre après confirmation, et pas sans', async () => {
    wrap(<LibraryChatSwitch />);
    expect(await screen.findByText(t.chatStatusClosed)).toBeTruthy();
    const open = screen.getByRole('button', { name: t.chatOpen });

    fireEvent.click(open);
    let dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /annuler/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls('PUT', '/api/admin/library/chat-settings')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: t.chatOpen }));
    dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: t.chatOpen }));
    await waitFor(() =>
      expect(calls('PUT', '/api/admin/library/chat-settings')).toHaveLength(1)
    );
    expect(calls('PUT', '/api/admin/library/chat-settings')[0][1].json).toEqual(
      {
        enabled: true,
      }
    );
    expect(
      await screen.findByRole('button', { name: t.chatClose })
    ).toBeTruthy();
  });
});

describe('LibraryChatMessagesPanel', () => {
  it('où, qui, quoi — texte brut, masqués compris', async () => {
    wrap(<LibraryChatMessagesPanel />);
    const rows = await screen.findAllByTestId('library-chat-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain(t.chatRoomHall);
    expect(rows[0].textContent).toContain('Lune');
    expect(rows[0].textContent).toContain('tu es nulle <b>vraiment</b>');
    expect(rows[0].querySelector('b')).toBeNull();
    expect(rows[1].textContent).toContain(
      format(t.chatRoomApartmentOf, { name: 'Soleil' })
    );
    expect(rows[1].textContent).toContain(t.chatHiddenTag);
    // Déjà masqué : pas de bouton « Masquer ».
    expect(
      within(rows[1]).queryByRole('button', {
        name: format(t.chatHideAria, { name: 'Soleil' }),
      })
    ).toBeNull();
  });

  it('masquer passe par une confirmation puis l’API', async () => {
    wrap(<LibraryChatMessagesPanel />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: format(t.chatHideAria, { name: 'Lune' }),
      })
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: t.chatConfirmHideLabel })
    );
    await waitFor(() =>
      expect(calls('POST', '/api/admin/library/messages/hide')).toHaveLength(1)
    );
    expect(
      calls('POST', '/api/admin/library/messages/hide')[0][1].json
    ).toEqual({
      messageId: M1.id,
    });
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(t.chatHidden, 'success')
    );
  });

  it('sourdine : motif obligatoire, puis portée et durée envoyées', async () => {
    wrap(<LibraryChatMessagesPanel />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: format(t.chatMuteAria, { name: 'Lune' }),
      })
    );
    const form = await screen.findByTestId('library-chat-mute-form');
    fireEvent.click(
      within(form).getByRole('button', { name: t.chatMuteSubmit })
    );
    expect(
      await within(form).findByText(t.chatMuteReasonRequired)
    ).toBeTruthy();
    expect(calls('POST', '/api/admin/library/mutes')).toHaveLength(0);

    fireEvent.click(
      within(form).getByRole('radio', { name: t.chatMuteScopeLibrary })
    );
    fireEvent.click(within(form).getByRole('radio', { name: t.chatMute7d }));
    fireEvent.change(
      within(form).getByRole('textbox', { name: t.chatMuteReasonLabel }),
      {
        target: { value: 'insultes répétées' },
      }
    );
    fireEvent.click(
      within(form).getByRole('button', { name: t.chatMuteSubmit })
    );
    await waitFor(() =>
      expect(calls('POST', '/api/admin/library/mutes')).toHaveLength(1)
    );
    expect(calls('POST', '/api/admin/library/mutes')[0][1].json).toEqual({
      userId: LUNE,
      roomId: null,
      minutes: 7 * 24 * 60,
      reason: 'insultes répétées',
    });
    await waitFor(() =>
      expect(screen.queryByTestId('library-chat-mute-form')).toBeNull()
    );
  });
});

describe('LibraryChatMutesList', () => {
  it('liste les sourdines en cours ; lever demande confirmation', async () => {
    wrap(<LibraryChatMutesList />);
    const rows = await screen.findAllByTestId('library-chat-mute-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Lune');
    expect(rows[0].textContent).toContain(t.chatMuteEverywhere);
    expect(rows[0].textContent).toContain('insultes');
    fireEvent.click(
      screen.getByRole('button', {
        name: format(t.chatLiftAria, { name: 'Lune' }),
      })
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: t.chatConfirmLiftLabel })
    );
    await waitFor(() =>
      expect(calls('DELETE', '/api/admin/library/mutes')).toHaveLength(1)
    );
    expect(String(calls('DELETE', '/api/admin/library/mutes')[0][0])).toBe(
      `/api/admin/library/mutes?id=${MUTE.id}`
    );
  });
});
