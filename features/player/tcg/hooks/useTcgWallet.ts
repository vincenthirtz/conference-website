// features/player/tcg/hooks/useTcgWallet.ts — l'historique du porte-monnaie,
// chargé AU CLIC (lot P14, même comportement que pages/player/tcg.tsx).
//
// Relu à chaque ouverture : le registre a pu bouger, et il est bon marché.
// UN ÉCHEC A SON MESSAGE, jamais un historique vide — qui ferait croire à une
// absence de mouvements.

import { useCallback, useState } from 'react';
import { tcgClient } from '../client';
import type { WalletEntry } from '../model';

export type WalletState = 'idle' | 'loading' | 'ready' | 'error';

export function useTcgWallet() {
  const [wallet, setWallet] = useState<{
    entries: WalletEntry[];
    truncated: boolean;
  } | null>(null);
  const [state, setState] = useState<WalletState>('idle');
  const [open, setOpen] = useState(false);

  const toggle = useCallback(async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setState('loading');
    try {
      const data = await tcgClient.wallet();
      setWallet({
        entries: data.entries ?? [],
        truncated: data.truncated === true,
      });
      setState('ready');
    } catch {
      setWallet(null);
      setState('error');
    }
  }, [open]);

  return { wallet, state, open, toggle };
}
