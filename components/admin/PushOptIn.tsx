// components/admin/PushOptIn.tsx
//
// Banner discret affiché en haut des pages /admin, qui propose au staff
// d'activer les notifications Web Push pour cette PWA.
//
// Conditions d'affichage (TOUTES doivent être vraies) :
//   1. `process.env.NEXT_PUBLIC_ENABLE_PWA === '1'` (gate prod-only)
//   2. Le browser supporte Notification + ServiceWorker + PushManager
//   3. `Notification.permission === 'default'` (jamais demandé)
//   4. L'user n'a pas cliqué "Plus tard" précédemment (localStorage flag)
//   5. Pas encore d'abonnement actif (`pushManager.getSubscription()`)
//
// Le flow opt-in :
//   - Click "Activer" → `Notification.requestPermission()`
//   - Si granted → `pushManager.subscribe({ applicationServerKey })`
//   - POST `/api/admin/notifications/subscribe` avec la sub
//   - Toast succès / erreur
//
// Si l'user clique "Plus tard", on stocke `pwa-push-dismissed=1` dans
// localStorage et on n'affiche plus jamais le banner (modulo clear cache).
// L'user peut toujours s'abonner manuellement depuis /admin/notifications.

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { logger } from '@/utils/logger';
import {
  getActivePushSubscription,
  getWebPushSupport,
  urlBase64ToUint8Array,
} from '@/utils/webPush';

const DISMISS_KEY = 'pwa-push-dismissed';
const DENIED_KEY = 'pwa-push-denied';

export default function PushOptIn() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();

  useEffect(() => {
    // Hard gate : la PWA n'est active qu'en prod. En dev / preview, ce
    // composant est totalement no-op.
    if (process.env.NEXT_PUBLIC_ENABLE_PWA !== '1') return;

    const support = getWebPushSupport();
    if (!support.supported) return;

    // Si l'user a déjà "skip" précédemment, on n'affiche plus rien.
    try {
      if (
        window.localStorage.getItem(DISMISS_KEY) === '1' ||
        window.localStorage.getItem(DENIED_KEY) === '1'
      ) {
        return;
      }
    } catch {
      // localStorage indisponible (private mode safari, etc.) → on accepte
      // d'afficher le banner. Pas de mémoire = pas de mute persistant.
    }

    if (Notification.permission !== 'default') {
      // Déjà accordé ou refusé : aucun intérêt à afficher l'opt-in. Si granted
      // sans sub active, la page /admin/notifications gère le réabonnement.
      if (Notification.permission === 'denied') {
        try {
          window.localStorage.setItem(DENIED_KEY, '1');
        } catch {
          // Ignore.
        }
      }
      return;
    }

    // Si le user a déjà une subscription (cas de visite ré-engagée sans
    // notification.permission "default"), on n'affiche pas non plus.
    let cancelled = false;
    getActivePushSubscription().then((sub) => {
      if (cancelled) return;
      if (sub) return;
      setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDismiss = useCallback(() => {
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Ignore.
    }
    setVisible(false);
  }, []);

  const handleActivate = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        addToast(
          'Notifications non configurées sur ce serveur (clé VAPID manquante).',
          'error'
        );
        setVisible(false);
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        if (permission === 'denied') {
          try {
            window.localStorage.setItem(DENIED_KEY, '1');
          } catch {
            // Ignore.
          }
          addToast(
            'Permission refusée. Tu peux la réactiver depuis les réglages du navigateur.',
            'warning'
          );
        }
        setVisible(false);
        return;
      }

      // À ce stade le SW devrait déjà être enregistré (cf. _app.tsx).
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await adminFetchJson('/api/admin/notifications/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          user_agent:
            typeof navigator !== 'undefined' ? navigator.userAgent : null,
        }),
      });

      addToast(
        'Notifications activées. Tu recevras les alertes match, scrim et support.',
        'success'
      );
      setVisible(false);
    } catch (err) {
      logger.error('[PushOptIn] activate failed', err);
      addToast(
        (err as Error)?.message ||
          'Impossible d’activer les notifications. Réessaie plus tard.',
        'error'
      );
    } finally {
      setBusy(false);
    }
  }, [addToast, adminFetchJson, busy]);

  if (!visible) return null;

  return (
    <div className="bg-purple-900/40 border-b border-purple-500/30 text-purple-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <svg
            className="w-5 h-5 flex-shrink-0 text-purple-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          <p className="text-sm leading-snug">
            Active les notifications pour être alerté·e des matches, disputes et
            inscriptions, même quand l’onglet est fermé.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleDismiss}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded-md border border-purple-500/30 hover:bg-purple-500/10 transition-colors disabled:opacity-50"
            data-testid="push-optin-dismiss"
          >
            Plus tard
          </button>
          <button
            type="button"
            onClick={handleActivate}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded-md bg-purple-500 hover:bg-purple-400 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="push-optin-activate"
          >
            {busy ? 'Activation…' : 'Activer'}
          </button>
        </div>
      </div>
    </div>
  );
}
