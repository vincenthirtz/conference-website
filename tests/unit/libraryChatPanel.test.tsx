// @vitest-environment happy-dom
//
// Women's Library, lot 6 — le chat d'une salle, côté écran
// (features/player/library/ui/chat/LibraryChat.tsx), contre un client en
// mémoire et le relais de la salle (realtime/chatBus.ts). Les routes sont
// testées dans conference-api (libraryChatApi.test.ts).
//
// Ce que ces cas protègent :
//   * jamais dans la Grande salle de lecture ; fermé, une notice et rien
//     d'autre ;
//   * le fil est une région vivante polie, en TEXTE BRUT (aucun lien) ; un
//     message masqué perd son texte ; bloquer fait disparaître ses messages ;
//   * l'envoi passe par l'API ; ses refus sont dits clairement (filtré, trop
//     rapide, en sourdine), le compteur borne à 200 ;
//   * les gestes : signaler pour toutes, masquer / sourdine seulement pour
//     qui en a le droit ; rien sur son propre message.

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
import nsChat from '@/lib/i18n/locales/fr/playerLibraryChat';
import { format } from '@/lib/i18n/useT';
import LibraryChat from '@/features/player/library/ui/chat/LibraryChat';
import {
  clearLibraryChat,
  publishLibraryChatContext,
  publishLibraryChatEvent,
} from '@/features/player/library/realtime/chatBus';
import type { LibraryChatClient } from '@/features/player/library/realtime/chatClient';
import type {
  LibraryChatMessage,
  LibraryChatState,
} from '@/features/player/library/chat/responses';
import { LIBRARY_CHAT_CLOSED } from '@/features/player/library/chat/responses';
import { PlayerHttpError } from '@/utils/player/playerHttp';

const t = nsChat.fr;
const ROOM = '00000000-0000-4000-8000-0000000000e1';
const ME = '00000000-0000-4000-8000-000000000001';
const IRIS = '00000000-0000-4000-8000-000000000011';

const OPEN: LibraryChatState = {
  enabled: true,
  canWrite: true,
  canModerate: false,
  canHide: false,
  canMute: false,
  mutedUntil: null,
};

let n = 0;
function msg(userId: string, body: string): LibraryChatMessage {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(5000 + n).padStart(12, '0')}`,
    userId,
    nickname: userId === ME ? 'Lune' : 'Iris',
    body,
    createdAt: new Date(Date.UTC(2026, 9, 20, 18, 0, n)).toISOString(),
  };
}

function fakeClient(
  over: Partial<Record<keyof LibraryChatClient, unknown>> = {}
) {
  return {
    list: vi.fn(async () => ({
      messages: [] as LibraryChatMessage[],
      chat: OPEN,
    })),
    send: vi.fn(async (_room: string, body: string) => ({
      message: { ...msg(ME, body) },
      masked: false,
    })),
    hide: vi.fn(async (_room: string, id: string) => ({
      id,
      hidden: true as const,
    })),
    mute: vi.fn(async (_room: string, input: { userId: string }) => ({
      userId: input.userId,
      roomId: ROOM,
      until: '2026-10-20T19:00:00.000Z',
    })),
    report: vi.fn(async () => ({
      reported: true as const,
      referenceShort: 'ab12cd34',
    })),
    ...over,
  } as unknown as LibraryChatClient & Record<string, ReturnType<typeof vi.fn>>;
}

async function mount(
  client: ReturnType<typeof fakeClient>,
  kind: 'hall' | 'reading_room' = 'hall'
) {
  publishLibraryChatContext(ROOM, { selfId: ME, hiddenUserIds: [] });
  const view = render(
    <LibraryChat roomId={ROOM} kind={kind} client={client} />
  );
  if (kind !== 'reading_room') {
    await waitFor(() =>
      expect(
        view.container.querySelector('[data-chat-phase="ready"]')
      ).not.toBeNull()
    );
  }
  return view;
}

afterEach(() => {
  cleanup();
  clearLibraryChat(ROOM);
});

describe('LibraryChat — où et quand', () => {
  it('Grande salle de lecture : rien, pas même une lecture', async () => {
    const client = fakeClient();
    const { container } = await mount(client, 'reading_room');
    expect(container.innerHTML).toBe('');
    expect(client.list).not.toHaveBeenCalled();
  });

  it('fermé : la notice, ni fil ni saisie', async () => {
    const client = fakeClient({
      list: vi.fn(async () => ({ messages: [], chat: LIBRARY_CHAT_CLOSED })),
    });
    await mount(client);
    expect(screen.getByText(t.closedTitle)).toBeTruthy();
    expect(screen.queryByRole('log')).toBeNull();
    expect(screen.queryByLabelText(t.composer.label)).toBeNull();
  });
});

describe('LibraryChat — le fil', () => {
  it('région vivante polie, texte brut : aucun lien, même pour une URL ou du HTML', async () => {
    const client = fakeClient({
      list: vi.fn(async () => ({
        messages: [
          msg(IRIS, 'regardez https://owwomenscup.fr/live'),
          msg(IRIS, '<a href="https://x.test">clic</a>'),
        ],
        chat: OPEN,
      })),
    });
    await mount(client);
    const log = screen.getByRole('log');
    expect(log.getAttribute('aria-live')).toBe('polite');
    expect(
      within(log).getByText('regardez https://owwomenscup.fr/live')
    ).toBeTruthy();
    expect(
      within(log).getByText('<a href="https://x.test">clic</a>')
    ).toBeTruthy();
    expect(log.querySelector('a')).toBeNull();
  });

  it('un message masqué par la modération perd son texte, chez moi aussi', async () => {
    const m = msg(IRIS, 'propos déplacé');
    await mount(
      fakeClient({ list: vi.fn(async () => ({ messages: [m], chat: OPEN })) })
    );
    act(() => publishLibraryChatEvent(ROOM, { type: 'hidden', id: m.id }));
    expect(screen.queryByText('propos déplacé')).toBeNull();
    expect(screen.getByText(t.hiddenMessage)).toBeTruthy();
  });

  it('un message reçu en direct s’ajoute ; bloquer fait disparaître ses messages', async () => {
    await mount(fakeClient());
    act(() =>
      publishLibraryChatEvent(ROOM, {
        type: 'message',
        message: msg(IRIS, 'coucou'),
      })
    );
    expect(screen.getByText('coucou')).toBeTruthy();
    act(() =>
      publishLibraryChatContext(ROOM, { selfId: ME, hiddenUserIds: [IRIS] })
    );
    expect(screen.queryByText('coucou')).toBeNull();
  });
});

describe('LibraryChat — écrire', () => {
  it('envoie par l’API, vide le champ, signale un masquage', async () => {
    const client = fakeClient({
      send: vi.fn(async (_r: string, body: string) => ({
        message: msg(ME, 'mon num [•••]'),
        masked: body.includes('06'),
      })),
    });
    await mount(client);
    const input = screen.getByLabelText(t.composer.label) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'mon num 06 12 34 56 78' } });
    fireEvent.click(screen.getByRole('button', { name: t.composer.send }));
    await screen.findByText('mon num [•••]');
    expect(client.send).toHaveBeenCalledWith(ROOM, 'mon num 06 12 34 56 78');
    expect(input.value).toBe('');
    expect(screen.getByText(t.composer.masked)).toBeTruthy();
  });

  it('au-delà de 200 caractères : champ invalide, envoi impossible', async () => {
    const client = fakeClient();
    await mount(client);
    const input = screen.getByLabelText(t.composer.label);
    fireEvent.change(input, { target: { value: 'x'.repeat(201) } });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const send = screen.getByRole('button', { name: t.composer.send });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText(format(t.composer.tooLong, { max: 200 }))
    ).toBeTruthy();
  });

  it.each([
    [422, { code: 'chat_filtered' }, t.errors.chat_filtered],
    [
      429,
      { code: 'chat_too_fast', retryAfterMs: 3200 },
      format(t.errors.chat_too_fast, { seconds: 4 }),
    ],
    [409, { code: 'chat_duplicate' }, t.errors.chat_duplicate],
  ])('refus %s : dit clairement pourquoi', async (status, payload, text) => {
    const client = fakeClient({
      send: vi.fn(async () => {
        throw new PlayerHttpError('refus', status, payload);
      }),
    });
    await mount(client);
    fireEvent.change(screen.getByLabelText(t.composer.label), {
      target: { value: 'bonjour' },
    });
    fireEvent.click(screen.getByRole('button', { name: t.composer.send }));
    expect((await screen.findByRole('alert')).textContent).toBe(text);
  });

  it('en sourdine (refus ou événement) : la saisie laisse place à la fin de la sourdine', async () => {
    const until = new Date(Date.now() + 3_600_000).toISOString();
    const client = fakeClient({
      send: vi.fn(async () => {
        throw new PlayerHttpError('refus', 403, { code: 'chat_muted', until });
      }),
    });
    const { container } = await mount(client);
    fireEvent.change(screen.getByLabelText(t.composer.label), {
      target: { value: 'bonjour' },
    });
    fireEvent.click(screen.getByRole('button', { name: t.composer.send }));
    await waitFor(() =>
      expect(container.querySelector('[data-chat-muted]')).not.toBeNull()
    );
    expect(screen.queryByLabelText(t.composer.label)).toBeNull();
    act(() => publishLibraryChatEvent(ROOM, { type: 'unmuted', roomId: null }));
    expect(screen.getByLabelText(t.composer.label)).toBeTruthy();
  });
});

describe('LibraryChat — les gestes', () => {
  const openActions = (nickname: string) =>
    fireEvent.click(
      screen.getByRole('button', { name: format(t.actions.open, { nickname }) })
    );

  it('sans droit : seulement « Signaler » ; rien sur mon propre message', async () => {
    await mount(
      fakeClient({
        list: vi.fn(async () => ({
          messages: [msg(ME, 'à moi'), msg(IRIS, 'à elle')],
          chat: OPEN,
        })),
      })
    );
    expect(
      screen.queryByRole('button', {
        name: format(t.actions.open, { nickname: 'Lune' }),
      })
    ).toBeNull();
    openActions('Iris');
    expect(screen.getByRole('button', { name: t.actions.report })).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.actions.hide })).toBeNull();
    expect(screen.queryByRole('button', { name: t.actions.mute })).toBeNull();
  });

  it('signaler : un motif, puis la référence', async () => {
    const m = msg(IRIS, 'insistante');
    const client = fakeClient({
      list: vi.fn(async () => ({ messages: [m], chat: OPEN })),
    });
    await mount(client);
    openActions('Iris');
    fireEvent.click(screen.getByRole('button', { name: t.actions.report }));
    fireEvent.click(screen.getByLabelText(t.report.reasons.harassment));
    fireEvent.change(screen.getByLabelText(t.report.detailsLabel), {
      target: { value: ' depuis hier ' },
    });
    fireEvent.click(screen.getByRole('button', { name: t.report.submit }));
    await screen.findByText(
      format(t.report.reference, { reference: 'ab12cd34' })
    );
    expect(client.report).toHaveBeenCalledWith(ROOM, m.id, {
      reason: 'harassment',
      details: 'depuis hier',
    });
  });

  it('modératrice : masquer et mettre en sourdine passent par l’API', async () => {
    const m = msg(IRIS, 'hors sujet');
    const client = fakeClient({
      list: vi.fn(async () => ({
        messages: [m],
        chat: { ...OPEN, canModerate: true, canHide: true, canMute: true },
      })),
    });
    await mount(client);
    openActions('Iris');
    fireEvent.click(screen.getByRole('button', { name: t.actions.mute }));
    fireEvent.click(screen.getByLabelText(t.mute.durations.hour1));
    fireEvent.click(screen.getByRole('button', { name: t.mute.confirm }));
    await waitFor(() =>
      expect(client.mute).toHaveBeenCalledWith(ROOM, {
        userId: IRIS,
        minutes: 60,
      })
    );

    openActions('Iris');
    fireEvent.click(screen.getByRole('button', { name: t.actions.hide }));
    fireEvent.click(screen.getByRole('button', { name: t.hide.confirm }));
    await waitFor(() => expect(client.hide).toHaveBeenCalledWith(ROOM, m.id));
    await screen.findByText(t.hiddenMessage);
  });
});
