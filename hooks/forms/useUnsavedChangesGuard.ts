// hooks/forms/useUnsavedChangesGuard.ts — « Quitter sans enregistrer ? »
// (lot L11 admin, rendu commun au lot P6 joueuse ; l'ancien chemin
// hooks/admin/useUnsavedChangesGuard.ts ré-exporte).
//
// Deux sorties à garder : fermer / recharger l'onglet (`beforeunload`, le
// navigateur affiche son propre message) et naviguer DANS l'app (événement
// `routeChangeStart` du pages-router, qu'on annule si la personne refuse).
//
// Annuler une navigation Next demande de LEVER dans `routeChangeStart` : c'est
// le seul moyen documenté par l'usage ; l'erreur est une chaîne reconnaissable
// pour qu'elle ne soit pas prise pour un vrai plantage.
//
// Le SINGLETON `Router` (et non `useRouter()`) : `useSchemaForm` appelle ce
// hook à chaque rendu, y compris hors d'une app Next montée (tests de
// composants) où `useRouter()` lèverait. `Router.events` existe sans montage.

import { useEffect, useRef } from 'react';
import Router from 'next/router';

export const NAVIGATION_ABORTED = 'admin-unsaved-changes:navigation-aborted';

function currentPath(): string | null {
  try {
    return Router.asPath ?? null;
  } catch {
    return null;
  }
}

export function useUnsavedChangesGuard(
  when: boolean,
  message = 'Des modifications ne sont pas enregistrées. Quitter quand même ?'
) {
  const whenRef = useRef(when);
  whenRef.current = when;
  const messageRef = useRef(message);
  messageRef.current = message;

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!whenRef.current) return;
      e.preventDefault();
      // Requis par certains navigateurs pour afficher la confirmation.
      e.returnValue = '';
    };
    const events = Router.events;
    const onRouteChangeStart = (url: string) => {
      if (!whenRef.current || url === currentPath()) return;
      if (window.confirm(messageRef.current)) return;
      events?.emit('routeChangeError');
      throw NAVIGATION_ABORTED;
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    events?.on('routeChangeStart', onRouteChangeStart);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      events?.off('routeChangeStart', onRouteChangeStart);
    };
  }, []);
}
