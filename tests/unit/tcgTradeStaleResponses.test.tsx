// @vitest-environment happy-dom
//
// Échanges TCG — seule la DERNIÈRE lecture écrit l'état.
//
// Choisir la partenaire A puis B : si la réponse de A arrive APRÈS celle de B,
// l'écran doit montrer les doubles de B (et ne lever aucun toast pour A,
// lecture abandonnée et non ratée). Même règle pour la boîte de propositions
// quand on passe de « reçues » à « envoyées » pendant une lecture.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

const addToast = vi.fn();
vi.mock('@/components/Toast', () => ({ useToast: () => ({ addToast }) }));
vi.mock('@/lib/i18n/useT', () => ({
  useT: () =>
    new Proxy({}, { get: (_t, key) => (typeof key === 'string' ? key : '') }),
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
  signal?: AbortSignal;
};
function deferred<T>(signal?: AbortSignal): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject, signal };
}

const partnerCalls: Array<Deferred<{ cards: unknown[] }> & { id: string }> = [];
const listCalls: Array<
  Deferred<{ trades: unknown[]; nextCursor: string | null }> & {
    box: string;
  }
> = [];

vi.mock('../../features/player/tcg/tradeClient', () => ({
  tradeClient: {
    partnerCards: (id: string, signal?: AbortSignal) => {
      const d = Object.assign(deferred<{ cards: unknown[] }>(signal), { id });
      partnerCalls.push(d);
      return d.promise;
    },
    list: (
      box: string,
      _state: string,
      _cursor: string | null,
      signal?: AbortSignal
    ) => {
      const d = Object.assign(
        deferred<{ trades: unknown[]; nextCursor: string | null }>(signal),
        { box }
      );
      listCalls.push(d);
      return d.promise;
    },
  },
}));

import { useTradeComposer } from '../../features/player/tcg/hooks/useTradeComposer';
import { useTradeInbox } from '../../features/player/tcg/hooks/useTradeInbox';

beforeEach(() => {
  partnerCalls.length = 0;
  listCalls.length = 0;
  addToast.mockReset();
});
afterEach(cleanup);

function composer() {
  return renderHook(() =>
    useTradeComposer({
      maxCards: 5,
      announce: () => {},
      setBusy: () => {},
      reloadSettings: async () => {},
      showSent: () => {},
    })
  );
}

describe('useTradeComposer — choix de partenaire', () => {
  it('A répond après B : les doubles affichés restent ceux de B', async () => {
    const { result } = composer();

    let pA!: Promise<void>;
    let pB!: Promise<void>;
    act(() => {
      pA = result.current.choosePartner('A');
    });
    act(() => {
      pB = result.current.choosePartner('B');
    });
    expect(partnerCalls.map((c) => c.id)).toEqual(['A', 'B']);
    expect(partnerCalls[0].signal?.aborted).toBe(true);
    expect(partnerCalls[1].signal?.aborted).toBe(false);

    await act(async () => {
      partnerCalls[1].resolve({ cards: [{ id: 'card-of-B' }] });
      await pB;
    });
    await act(async () => {
      partnerCalls[0].resolve({ cards: [{ id: 'card-of-A' }] });
      await pA;
    });

    expect(result.current.partnerId).toBe('B');
    expect(result.current.theirCards).toEqual([{ id: 'card-of-B' }]);
  });

  it('la lecture abandonnée qui échoue ne lève ni toast ni état d’erreur', async () => {
    const { result } = composer();

    let pA!: Promise<void>;
    let pB!: Promise<void>;
    act(() => {
      pA = result.current.choosePartner('A');
    });
    act(() => {
      pB = result.current.choosePartner('B');
    });
    await act(async () => {
      partnerCalls[1].resolve({ cards: [{ id: 'card-of-B' }] });
      await pB;
    });
    await act(async () => {
      partnerCalls[0].reject(new DOMException('aborted', 'AbortError'));
      await pA;
    });

    expect(addToast).not.toHaveBeenCalled();
    expect(result.current.theirError).toBeNull();
    expect(result.current.theirCards).toEqual([{ id: 'card-of-B' }]);
  });

  it('une vraie erreur de la partenaire courante reste signalée', async () => {
    const { result } = composer();
    let p!: Promise<void>;
    act(() => {
      p = result.current.choosePartner('A');
    });
    await act(async () => {
      partnerCalls[0].reject(new Error('boom'));
      await p;
    });
    expect(addToast).toHaveBeenCalledTimes(1);
    expect(result.current.theirCards).toBe('error');
  });
});

describe('useTradeInbox — bascule de boîte', () => {
  it('« reçues » répond après « envoyées » : la liste reste celle des envoyées', async () => {
    const { result } = renderHook(() => useTradeInbox());

    let pReceived!: Promise<void>;
    act(() => {
      pReceived = result.current.load(false, null);
    });
    act(() => {
      result.current.setBox('sent');
    });
    let pSent!: Promise<void>;
    act(() => {
      pSent = result.current.load(false, null);
    });
    expect(listCalls.map((c) => c.box)).toEqual(['received', 'sent']);
    expect(listCalls[0].signal?.aborted).toBe(true);

    await act(async () => {
      listCalls[1].resolve({ trades: [{ id: 'sent-1' }], nextCursor: null });
      await pSent;
    });
    await act(async () => {
      listCalls[0].resolve({
        trades: [{ id: 'received-1' }],
        nextCursor: 'c',
      });
      await pReceived;
    });

    expect(result.current.box).toBe('sent');
    expect(result.current.trades).toEqual([{ id: 'sent-1' }]);
    expect(result.current.cursor).toBeNull();
    expect(result.current.state).toBe('ready');
  });

  it('une lecture abandonnée qui échoue ne passe pas la boîte en erreur', async () => {
    const { result } = renderHook(() => useTradeInbox());

    let p1!: Promise<void>;
    let p2!: Promise<void>;
    act(() => {
      p1 = result.current.load(false, null);
    });
    act(() => {
      result.current.setListState('closed');
    });
    act(() => {
      p2 = result.current.load(false, null);
    });
    await act(async () => {
      listCalls[1].resolve({ trades: [], nextCursor: null });
      await p2;
    });
    await act(async () => {
      listCalls[0].reject(new DOMException('aborted', 'AbortError'));
      await p1;
    });

    expect(result.current.state).toBe('ready');
    expect(addToast).not.toHaveBeenCalled();
  });
});
