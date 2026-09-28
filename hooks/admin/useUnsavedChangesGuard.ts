// hooks/admin/useUnsavedChangesGuard.ts — « Quitter sans enregistrer ? »
// (lot L11, docs/PLAN-industrialisation-admin.md).
//
// Deux sorties à garder : fermer / recharger l'onglet (`beforeunload`, le
// navigateur affiche son propre message) et naviguer DANS l'app (événement
// `routeChangeStart` du pages-router, qu'on annule si la personne refuse).
//
// Annuler une navigation Next demande de LEVER dans `routeChangeStart` : c'est
// le seul moyen documenté par l'usage ; l'erreur est une chaîne reconnaissable
// pour qu'elle ne soit pas prise pour un vrai plantage.

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';

export const NAVIGATION_ABORTED = 'admin-unsaved-changes:navigation-aborted';

export function useUnsavedChangesGuard(
  when: boolean,
  message = 'Des modifications ne sont pas enregistrées. Quitter quand même ?'
) {
  const router = useRouter();
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
    const onRouteChangeStart = (url: string) => {
      if (!whenRef.current || url === router.asPath) return;
      if (window.confirm(messageRef.current)) return;
      router.events.emit('routeChangeError');
      throw NAVIGATION_ABORTED;
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    router.events.on('routeChangeStart', onRouteChangeStart);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      router.events.off('routeChangeStart', onRouteChangeStart);
    };
  }, [router]);
}
