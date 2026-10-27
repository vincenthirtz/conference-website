// hooks/useRouterReady.ts
//
// `router.isReady`, mais jamais pendant l'hydratation.
//
// LE PIÈGE. Sur une page pré-rendue (sans getServerSideProps), Next considère
// le routeur prêt DÈS le premier rendu client quand l'URL n'a pas de query. Le
// serveur, lui, a rendu avec `isReady` à false. Une page qui affiche autre
// chose selon `isReady` — le message « paramètre manquant » des sources OBS —
// produit alors à l'hydratation un HTML différent de celui du serveur : erreur
// React #418, arbre jeté et reconstruit. Constaté le 2026-10-27 sur
// /overlay/day, /overlay/finales, /overlay/standings et /overlay/don-alert
// ouverts sans paramètre.
//
// `useSyncExternalStore` rend la valeur serveur (`false`) pendant l'hydratation
// puis la valeur client : le premier rendu client reproduit le HTML du
// serveur, le suivant applique `isReady`. Hors hydratation (navigation côté
// client), la valeur est juste dès le premier rendu.

import { useRouter } from 'next/router';
import { useSyncExternalStore } from 'react';

// Rien à écouter : seule compte la différence entre rendu serveur et client.
const noSubscription = () => () => {};

export function useRouterReady(): boolean {
  const router = useRouter();
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false
  );
  return hydrated && router.isReady;
}
