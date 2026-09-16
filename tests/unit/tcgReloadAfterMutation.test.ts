// tests/unit/tcgReloadAfterMutation.test.ts
//
// `utils/tcg/reloadAfterMutation.ts` — la relecture qui suit TOUTE mutation du
// TCG, quelle que soit l'issue.
//
// LE CAS QUI COÛTAIT DE L'ARGENT. `buyBooster` (pages/player/tcg.tsx) relisait
// le solde sur un refus et sur un succès, mais pas dans son `catch`. Une
// réponse perdue APRÈS le débit laissait l'ancien solde à l'écran ; la joueuse
// recliquait, et payait un second paquet. Le `catch` d'un `fetch` ne dit pas
// que la mutation a échoué — seulement que la réponse n'est pas arrivée.
// Ces cas tiennent la règle : la relecture ne dépend pas de la sortie.

import { describe, expect, it, vi } from 'vitest';

import { reloadAfterMutation } from '../../utils/tcg/reloadAfterMutation';

describe('reloadAfterMutation', () => {
  it('relit après un succès, sans signaler d’erreur', async () => {
    const reload = vi.fn(async () => undefined);
    const onError = vi.fn();
    await reloadAfterMutation(async () => undefined, { reload, onError });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('relit après une EXCEPTION (réponse perdue) — le cas du double achat', async () => {
    const calls: string[] = [];
    const failure = new TypeError('Failed to fetch');
    await reloadAfterMutation(
      async () => {
        calls.push('mutate');
        throw failure;
      },
      {
        reload: async () => {
          calls.push('reload');
        },
        onError: (err) => {
          expect(err).toBe(failure);
          calls.push('error');
        },
      }
    );
    // Le message part AVANT la relecture, qui peut prendre une seconde.
    expect(calls).toEqual(['mutate', 'error', 'reload']);
  });

  it('relit après un refus rendu par la route (sortie anticipée de la mutation)', async () => {
    const reload = vi.fn(async () => undefined);
    await reloadAfterMutation(
      async () => {
        // ex. `if (!res.ok) { addToast(…); return; }`
        return;
      },
      { reload, onError: vi.fn() }
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('attend la relecture avant de rendre la main (le bouton reste bloqué d’ici là)', async () => {
    let reloaded = false;
    await reloadAfterMutation(
      async () => {
        throw new Error('network');
      },
      {
        reload: () =>
          new Promise<void>((resolve) =>
            setTimeout(() => {
              reloaded = true;
              resolve();
            }, 5)
          ),
        onError: () => undefined,
      }
    );
    expect(reloaded).toBe(true);
  });

  it('une relecture qui échoue à son tour ne remonte pas', async () => {
    await expect(
      reloadAfterMutation(async () => undefined, {
        reload: async () => {
          throw new Error('toujours hors ligne');
        },
        onError: vi.fn(),
      })
    ).resolves.toBeUndefined();
  });
});
