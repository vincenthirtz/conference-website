// components/shared/PushOptIn.tsx
//
// Banner / bouton qui propose d activer les notifications Web Push.
//
// Reutilisable pour :
//   - audience='admin' : banner /admin (legacy comportement)
//   - audience='caster' : carte dans le Cockpit caster
//   - audience='public' : reserve futur (newsletter / fans), non utilise V1
//
// L audience ne change PAS la subscription cote serveur (push_subscriptions
// n a pas de colonne audience/topic en V1) : on stocke l audience UNIQUEMENT
// cote localStorage pour info, et on utilise le meme endpoint backend
// `/api/admin/notifications/subscribe`. Le tri par audience cote dispatcher
// se fait via les memberships (staff role / cast_members) — pas via la sub.
//
// Variants UI :
//   - variant='banner' : barre horizontale (admin top of page)
//   - variant='card' : carte autonome (cockpit caster, settings page)
//
// Auth : utilise useAdminFetch (Bearer token Supabase). Fonctionne pour
// n importe quel user staff (caster inclus) — le endpoint
// /api/admin/notifications/subscribe a withStaffRoute(_, 'caster').

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { logger } from '@/utils/logger';
import { useT } from '@/lib/i18n/useT';
import {
  getActivePushSubscription,
  getWebPushSupport,
  urlBase64ToUint8Array,
} from '@/utils/webPush';
import nsPushOptIn from '@/lib/i18n/locales/fr/pushOptIn';

export type PushAudience = 'admin' | 'caster' | 'player' | 'public';
export type PushVariant = 'banner' | 'card';

/**
 * Endpoint cible côté serveur selon l'audience :
 *   - admin/caster : /api/admin/notifications/subscribe (withStaffRoute caster).
 *   - player       : /api/player/push/subscribe (withAuthRoute, n'importe quel
 *                    auth user — un staff peut aussi s'y abonner s'il joue
 *                    dans une équipe).
 *   - public       : reserved future.
 */
function subscribeEndpoint(audience: PushAudience): string {
  if (audience === 'player') return '/api/player/push/subscribe';
  return '/api/admin/notifications/subscribe';
}

type Props = {
  audience: PushAudience;
  variant?: PushVariant;
  /** Path the AdminFetch hook redirects to on 401. */
  loginPath?: string;
  /** Custom intro copy ; default: depends on audience. */
  message?: string;
};

const DISMISS_KEY_PREFIX = 'pwa-push-dismissed';
const DENIED_KEY = 'pwa-push-denied';
const AUDIENCE_KEY = 'pwa-push-audience';

function dismissKey(audience: PushAudience): string {
  return `${DISMISS_KEY_PREFIX}-${audience}`;
}

export default function PushOptIn({
  audience,
  variant = 'banner',
  loginPath = '/admin/login',
  message,
}: Props) {
  const t = useT(nsPushOptIn);
  const defaultMessages: Record<PushAudience, string> = {
    admin: t.msgAdmin,
    caster: t.msgCaster,
    player: t.msgPlayer,
    public: t.msgPublic,
  };
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch({ loginPath });

  useEffect(() => {
    // Hard gate : la PWA n est active qu en prod. En dev / preview, ce
    // composant est totalement no-op.
    if (process.env.NEXT_PUBLIC_ENABLE_PWA !== '1') return;

    const support = getWebPushSupport();
    if (!support.supported) return;

    try {
      if (
        window.localStorage.getItem(dismissKey(audience)) === '1' ||
        window.localStorage.getItem(DENIED_KEY) === '1'
      ) {
        return;
      }
    } catch {
      // localStorage indisponible — on accepte d afficher.
    }

    if (typeof Notification === 'undefined') return;

    if (Notification.permission !== 'default') {
      if (Notification.permission === 'denied') {
        try {
          window.localStorage.setItem(DENIED_KEY, '1');
        } catch {
          // Ignore.
        }
      }
      return;
    }

    let cancelled = false;
    getActivePushSubscription().then((sub) => {
      if (cancelled) return;
      if (sub) return;
      setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, [audience]);

  const handleDismiss = useCallback(() => {
    try {
      window.localStorage.setItem(dismissKey(audience), '1');
    } catch {
      // Ignore.
    }
    setVisible(false);
  }, [audience]);

  const handleActivate = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        addToast(t.errVapidMissing, 'error');
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
          addToast(t.permDenied, 'warning');
        }
        setVisible(false);
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await adminFetchJson(subscribeEndpoint(audience), {
        method: 'POST',
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          user_agent:
            typeof navigator !== 'undefined' ? navigator.userAgent : null,
        }),
      });

      // Persiste l audience cote client (info uniquement — pas de filtrage
      // serveur pour la V1).
      try {
        window.localStorage.setItem(AUDIENCE_KEY, audience);
      } catch {
        // Ignore.
      }

      addToast(
        audience === 'caster'
          ? t.successCaster
          : audience === 'player'
            ? t.successPlayer
            : t.successDefault,
        'success'
      );
      setVisible(false);
    } catch (err) {
      logger.error('[PushOptIn] activate failed', err);
      addToast((err as Error)?.message || t.errActivate, 'error');
    } finally {
      setBusy(false);
    }
  }, [addToast, adminFetchJson, audience, busy, t]);

  if (!visible) return null;

  const copy = message ?? defaultMessages[audience];

  if (variant === 'card') {
    return (
      <div
        className="rounded-2xl border border-purple-500/30 bg-purple-900/30 backdrop-blur-sm text-purple-100 p-4"
        data-testid={`push-optin-card-${audience}`}
      >
        <div className="flex items-start gap-3">
          <svg
            className="w-6 h-6 flex-shrink-0 text-purple-300 mt-0.5"
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
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold mb-1">{t.cardTitle}</h3>
            <p className="text-xs text-purple-200/80 leading-snug">{copy}</p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleActivate}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded-md bg-purple-500 hover:bg-purple-400 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="push-optin-activate"
              >
                {busy ? t.activating : t.activate}
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded-md border border-purple-500/30 hover:bg-purple-500/10 transition-colors disabled:opacity-50"
                data-testid="push-optin-dismiss"
              >
                {t.later}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
          <p className="text-sm leading-snug">{copy}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleDismiss}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded-md border border-purple-500/30 hover:bg-purple-500/10 transition-colors disabled:opacity-50"
            data-testid="push-optin-dismiss"
          >
            {t.later}
          </button>
          <button
            type="button"
            onClick={handleActivate}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded-md bg-purple-500 hover:bg-purple-400 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="push-optin-activate"
          >
            {busy ? t.activating : t.activate}
          </button>
        </div>
      </div>
    </div>
  );
}
