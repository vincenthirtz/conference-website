// hooks/useUsesBetterAuth.ts — ce navigateur parle-t-il à Better Auth (lot 7) ?
//
// Faux au rendu serveur, puis la vraie valeur dans le navigateur, sans écart d'hydratation :
// l'interrupteur vit dans l'adresse et le stockage du navigateur (utils/authBackend.ts).

import { useSyncExternalStore } from 'react';
import { identityBrowser } from '@/utils/identityBrowser';

const noSubscription = () => () => {};

export function useUsesBetterAuth(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => identityBrowser.usesBetterAuth(),
    () => false
  );
}
