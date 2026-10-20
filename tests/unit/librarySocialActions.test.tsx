// @vitest-environment happy-dom
//
// Women's Library, lot 5 — `useLibrarySocialActions` (bloquer, lever un
// blocage, signaler, expulser) et `socialModel.ts`, contre un client HTTP
// injecté qui rend des RÉPONSES fixes de l'API (les routes sont testées dans
// conference-api).
//   * un blocage CONFIRMÉ masque tout de suite (`hideLocally`) ; un refus ne
//     masque rien ;
//   * lever un blocage ne révèle RIEN en local (le serveur décide) ;
//   * un refus rend `{ ok: false, code }`, `code` = clé de traduction ;
//   * un geste à la fois par sorte (le second appel concurrent rend `null`).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { PlayerHttpError } from '../../utils/player/playerHttp';
import {
  type LibrarySocialActionsClient,
  useLibrarySocialActions,
} from '../../features/player/library/hooks/useLibrarySocialActions';
import {
  canKickIn,
  emoteBarDisabledReason,
  LIBRARY_KICK_CHOICES,
  socialErrorKey,
  socialNoticeOf,
} from '../../features/player/library/socialModel';
import {
  type LibraryBlockResponse,
  LIBRARY_SOCIAL_CODES,
} from '../../features/player/library/socialResponses';
import {
  LIBRARY_KICK_DEFAULT_MINUTES,
  LIBRARY_KICK_MAX_MINUTES,
} from '../../features/player/library/socialSchemas';
import nsSocial from '../../lib/i18n/locales/fr/playerLibrarySocial';
import enSocial from '../../lib/i18n/locales/en/playerLibrarySocial';

afterEach(cleanup);

const IRIS = '00000000-0000-4000-8000-000000000011';
const ROOM = '00000000-0000-4000-8000-0000000000b1';
const UNTIL = '2026-10-20T15:30:00.000Z';

const refusal = (status: number, code?: string, extra = {}) =>
  new PlayerHttpError('refus', status, { error: 'refus', code, ...extra });

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function makeClient(
  overrides: Partial<LibrarySocialActionsClient> = {}
): LibrarySocialActionsClient {
  return {
    block: vi.fn(async (userId: string) => ({ userId, blocked: true })),
    unblock: vi.fn(async (userId: string) => ({ userId, blocked: false })),
    report: vi.fn(async () => ({
      reported: true as const,
      referenceShort: 'ab12cd34',
    })),
    kick: vi.fn(async (input) => ({
      kicked: true as const,
      userId: input.userId,
      until: UNTIL,
    })),
    ...overrides,
  };
}

function mount(client: LibrarySocialActionsClient) {
  const room = { hideLocally: vi.fn() };
  const hook = renderHook(() => useLibrarySocialActions({ room, client }), {
    wrapper,
  });
  return { room, ...hook };
}

describe('useLibrarySocialActions — bloquer', () => {
  it('confirmé par l’API : masquée tout de suite', async () => {
    const client = makeClient();
    const { result, room } = mount(client);
    let outcome: Awaited<ReturnType<typeof result.current.block>> = null;
    await act(async () => {
      outcome = await result.current.block(IRIS);
    });
    expect(client.block).toHaveBeenCalledWith(IRIS);
    expect(outcome).toEqual({
      ok: true,
      data: { userId: IRIS, blocked: true },
    });
    expect(room.hideLocally).toHaveBeenCalledWith(IRIS);
  });

  it('refusé : rien n’est masqué, le code est traduisible', async () => {
    const client = makeClient({
      block: vi.fn(async () => {
        throw refusal(404, 'player_not_found');
      }),
    });
    const { result, room } = mount(client);
    let outcome: Awaited<ReturnType<typeof result.current.block>> = null;
    await act(async () => {
      outcome = await result.current.block(IRIS);
    });
    expect(outcome).toMatchObject({ ok: false, code: 'player_not_found' });
    expect(room.hideLocally).not.toHaveBeenCalled();
  });

  it('un seul blocage à la fois : le second appel concurrent rend null', async () => {
    let release: () => void = () => {};
    const client = makeClient({
      block: vi.fn(
        (userId: string) =>
          new Promise<LibraryBlockResponse>((resolve) => {
            release = () => resolve({ userId, blocked: true });
          })
      ),
    });
    const { result } = mount(client);
    let first: Promise<unknown> = Promise.resolve();
    let second: unknown;
    await act(async () => {
      first = result.current.block(IRIS);
      second = await result.current.block(IRIS);
    });
    expect(second).toBeNull();
    await waitFor(() => expect(result.current.blockingId).toBe(IRIS));
    await act(async () => {
      release();
      await first;
    });
    expect(client.block).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.blockingId).toBeNull());
  });

  it('lever un blocage ne révèle rien en local (le serveur décide)', async () => {
    const client = makeClient();
    const { result, room } = mount(client);
    await act(async () => {
      await result.current.unblock(IRIS);
    });
    expect(client.unblock).toHaveBeenCalledWith(IRIS);
    expect(room.hideLocally).not.toHaveBeenCalled();
  });
});

describe('useLibrarySocialActions — signaler, expulser', () => {
  it('signaler : la référence courte revient', async () => {
    const client = makeClient();
    const { result } = mount(client);
    const input = { userId: IRIS, roomId: ROOM, reason: 'harassment' as const };
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.report(input);
    });
    expect(client.report).toHaveBeenCalledWith(input);
    expect(outcome).toEqual({
      ok: true,
      data: { reported: true, referenceShort: 'ab12cd34' },
    });
  });

  it('signaler trop souvent (429) → `rate_limited`', async () => {
    const client = makeClient({
      report: vi.fn(async () => {
        throw refusal(429);
      }),
    });
    const { result } = mount(client);
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.report({
        userId: IRIS,
        roomId: ROOM,
        reason: 'other',
      });
    });
    expect(outcome).toMatchObject({ ok: false, code: 'rate_limited' });
  });

  it('expulser : la durée choisie part, ou rien (défaut de l’API)', async () => {
    const client = makeClient();
    const { result, room } = mount(client);
    await act(async () => {
      await result.current.kick(IRIS, 60);
    });
    await act(async () => {
      await result.current.kick(IRIS);
    });
    expect(client.kick).toHaveBeenNthCalledWith(1, {
      userId: IRIS,
      minutes: 60,
    });
    expect(client.kick).toHaveBeenNthCalledWith(2, { userId: IRIS });
    // L'expulsion se voit par le `kicked` du canal serveur, pas en local.
    expect(room.hideLocally).not.toHaveBeenCalled();
  });
});

describe('socialModel', () => {
  it('socialErrorKey : codes de l’API, bannie, 429, le reste', () => {
    expect(socialErrorKey(refusal(403, 'room_forbidden'))).toBe(
      'room_forbidden'
    );
    expect(socialErrorKey(refusal(500, 'report_failed'))).toBe('report_failed');
    expect(socialErrorKey(refusal(403, 'LIBRARY_BANNED'))).toBe(
      'library_banned'
    );
    expect(socialErrorKey(refusal(429, 'RATE_LIMITED'))).toBe('rate_limited');
    expect(socialErrorKey(refusal(400, 'validation'))).toBe('generic');
    expect(socialErrorKey(new Error('réseau'))).toBe('generic');
    expect(socialErrorKey(null)).toBe('generic');
  });

  it('chaque code de LIBRARY_SOCIAL_CODES a son message, en FR comme en EN', () => {
    for (const code of Object.values(LIBRARY_SOCIAL_CODES)) {
      expect(nsSocial.fr.codes[code], code).toBeTruthy();
      expect(enSocial.codes[code], code).toBeTruthy();
    }
  });

  it('les durées d’expulsion : 30 min par défaut, 1 h, 24 h au plus', () => {
    expect(LIBRARY_KICK_CHOICES.map((c) => c.minutes)).toEqual([
      LIBRARY_KICK_DEFAULT_MINUTES,
      60,
      LIBRARY_KICK_MAX_MINUTES,
    ]);
    expect(LIBRARY_KICK_CHOICES[0].minutes).toBe(30);
  });

  it('expulser : seulement chez soi', () => {
    expect(canKickIn({ kind: 'apartment', isOwner: true })).toBe(true);
    expect(canKickIn({ kind: 'apartment', isOwner: false })).toBe(false);
    expect(canKickIn({ kind: 'hall', isOwner: true })).toBe(false);
  });

  it('socialNoticeOf : évictions, refus, panne', () => {
    const base = { eviction: null, refusal: null };
    expect(socialNoticeOf({ ...base, phase: 'connected' })).toBeNull();
    expect(
      socialNoticeOf({
        ...base,
        phase: 'evicted',
        eviction: { kind: 'kicked', until: UNTIL },
      })
    ).toEqual({ kind: 'kicked', until: UNTIL });
    expect(
      socialNoticeOf({
        ...base,
        phase: 'evicted',
        eviction: { kind: 'banned', until: null },
      })
    ).toEqual({ kind: 'banned', until: null });
    expect(
      socialNoticeOf({
        ...base,
        phase: 'evicted',
        eviction: { kind: 'closed' },
      })
    ).toEqual({ kind: 'closed' });
    const refused = (code: string, until?: string) =>
      socialNoticeOf({
        ...base,
        phase: 'refused',
        refusal: { code, ...(until ? { until } : {}) },
      });
    expect(refused('room_forbidden')).toEqual({ kind: 'forbidden' });
    expect(refused('room_kicked', UNTIL)).toEqual({
      kind: 'kickedEnter',
      until: UNTIL,
    });
    expect(refused('room_kicked')).toEqual({
      kind: 'kickedEnter',
      until: null,
    });
    expect(refused('room_not_found')).toEqual({ kind: 'notFound' });
    expect(refused('LIBRARY_BANNED')).toEqual({ kind: 'banned', until: null });
    expect(refused('enter_failed')).toEqual({ kind: 'error' });
    expect(socialNoticeOf({ ...base, phase: 'error' })).toEqual({
      kind: 'connection',
    });
  });

  it('emoteBarDisabledReason : connectée et visible, sinon pourquoi', () => {
    const room = {
      phase: 'connected' as const,
      visible: true,
      kind: 'hall' as const,
      canBeVisible: true,
    };
    expect(emoteBarDisabledReason(room)).toBeNull();
    expect(emoteBarDisabledReason({ ...room, phase: 'connecting' })).toBe(
      'offline'
    );
    expect(
      emoteBarDisabledReason({ ...room, kind: 'reading_room', visible: false })
    ).toBe('discreet');
    expect(
      emoteBarDisabledReason({ ...room, visible: false, canBeVisible: false })
    ).toBe('hidden');
  });
});
