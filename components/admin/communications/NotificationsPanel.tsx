// components/admin/communications/NotificationsPanel.tsx
//
// "Notifications" tab of the merged /admin/communications hub (ex-route
// /admin/notifications, 308-redirected here). Configuration Web Push pour le
// staff.
//
// Trois sections :
//   1. État de l'abonnement de CE device (permission + sub active)
//      → boutons réabonner / désabonner
//   2. Préférences par event_type (14+ events groupés en 5 catégories)
//      → toggle individuel ; save explicite via bouton "Enregistrer"
//   3. Test (envoie une notif factice sur tous les devices du user staff)
//
// minRole 'caster' — n'importe quel staff peut configurer ses notifs (re-gaté
// par le host via `hasAtLeastRole`).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import AlertBanner from '@/components/admin/AlertBanner';
import { logger } from '@/utils/logger';
import {
  WEB_PUSH_EVENT_TYPES,
  type WebPushEventType,
} from '@/utils/webPushEvents';
import {
  getActivePushSubscription,
  getWebPushSupport,
  urlBase64ToUint8Array,
} from '@/utils/webPush';

type PrefRow = { event_type: WebPushEventType; enabled: boolean };
type PrefsResponse = { prefs: PrefRow[] };
type TestResponse = {
  sent: number;
  expired_removed: number;
  failed: number;
};

type Dict = ReturnType<typeof useAdminT<'adminNotifications'>>;

// Groupement éditorial des event_types pour l'UI. Les labels sont en FR.
// Source des event_types : utils/webPushEvents.ts (single source of truth).
function getEventGroups(t: Dict): Array<{
  title: string;
  description?: string;
  events: Array<{
    type: WebPushEventType;
    label: string;
    hint?: string;
  }>;
}> {
  return [
    {
      title: t.groupMatchesCast,
      description: t.groupMatchesCastDesc,
      events: [
        {
          type: 'match.starting',
          label: t.evtMatchStartingLabel,
          hint: t.evtMatchStartingHint,
        },
        {
          type: 'match.finished',
          label: t.evtMatchFinishedLabel,
        },
        {
          type: 'match.score_reported',
          label: t.evtScoreReportedLabel,
          hint: t.evtScoreReportedHint,
        },
        { type: 'cast.assigned', label: t.evtCastAssignedLabel },
        { type: 'cast.unassigned', label: t.evtCastUnassignedLabel },
      ],
    },
    {
      title: t.groupScrims,
      events: [
        { type: 'scrim.invitation', label: t.evtScrimInvitationLabel },
        { type: 'scrim.confirmed', label: t.evtScrimConfirmedLabel },
      ],
    },
    {
      title: t.groupTournoi,
      events: [
        { type: 'team.forfeit', label: t.evtTeamForfeitLabel },
        { type: 'checkin.opened', label: t.evtCheckinOpenedLabel },
      ],
    },
    {
      title: t.groupRegistrations,
      events: [
        { type: 'registration.new', label: t.evtRegistrationNewLabel },
        {
          type: 'helloasso.payment.received',
          label: t.evtHelloassoPaymentLabel,
        },
        {
          type: 'captain.support.opened',
          label: t.evtCaptainSupportLabel,
        },
      ],
    },
    {
      title: t.groupOthers,
      events: [
        { type: 'news.published', label: t.evtNewsPublishedLabel },
        { type: 'staff.role.changed', label: t.evtStaffRoleChangedLabel },
      ],
    },
  ];
}

// Types couverts par les groupes UI ci-dessus (source pour le sanity check).
const COVERED_EVENT_TYPES: WebPushEventType[] = [
  'match.starting',
  'match.finished',
  'match.score_reported',
  'cast.assigned',
  'cast.unassigned',
  'scrim.invitation',
  'scrim.confirmed',
  'team.forfeit',
  'checkin.opened',
  'registration.new',
  'helloasso.payment.received',
  'captain.support.opened',
  'news.published',
  'staff.role.changed',
];

// Sanity check au runtime : si quelqu'un ajoute un event_type dans
// utils/webPushEvents.ts sans le mettre dans un groupe ci-dessus, log un warn.
function assertGroupsCoverAllEvents() {
  if (process.env.NODE_ENV === 'production') return;
  const inGroups = new Set<string>(COVERED_EVENT_TYPES);
  const missing = WEB_PUSH_EVENT_TYPES.filter((t) => !inGroups.has(t));
  if (missing.length > 0) {
    logger.warn(
      '[admin/notifications] event_types absents des groupes UI :',
      missing
    );
  }
}

type SubscriptionStatus =
  | { state: 'unsupported'; reason: string }
  | { state: 'denied' }
  | { state: 'default' } // jamais demandé
  | { state: 'no-sub' } // permission granted mais pas de sub active
  | { state: 'subscribed'; endpoint: string };

function formatStatusLabel(
  s: SubscriptionStatus,
  t: Dict
): {
  label: string;
  variant: 'success' | 'warning' | 'error' | 'info';
} {
  switch (s.state) {
    case 'subscribed':
      return { label: t.statusSubscribed, variant: 'success' };
    case 'no-sub':
      return {
        label: t.statusNoSub,
        variant: 'info',
      };
    case 'default':
      return { label: t.statusDefault, variant: 'info' };
    case 'denied':
      return { label: t.statusDenied, variant: 'warning' };
    case 'unsupported':
      return {
        label: format(t.statusUnsupported, { reason: s.reason }),
        variant: 'error',
      };
  }
}

export default function NotificationsPanel() {
  const t = useAdminT('adminNotifications');
  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();

  const [prefs, setPrefs] = useState<PrefRow[] | null>(null);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsError, setPrefsError] = useState<string | null>(null);

  const [subStatus, setSubStatus] = useState<SubscriptionStatus>({
    state: 'default',
  });
  const [subBusy, setSubBusy] = useState(false);

  const [testing, setTesting] = useState(false);

  const pwaEnabled = process.env.NEXT_PUBLIC_ENABLE_PWA === '1';

  useEffect(() => {
    assertGroupsCoverAllEvents();
  }, []);

  // ----- Statut de l'abonnement local --------------------------------------
  const refreshSubStatus = useCallback(async () => {
    const support = getWebPushSupport();
    if (!support.supported) {
      setSubStatus({ state: 'unsupported', reason: support.reason });
      return;
    }
    if (Notification.permission === 'denied') {
      setSubStatus({ state: 'denied' });
      return;
    }
    if (Notification.permission === 'default') {
      setSubStatus({ state: 'default' });
      return;
    }
    const sub = await getActivePushSubscription();
    if (sub) {
      setSubStatus({ state: 'subscribed', endpoint: sub.endpoint });
    } else {
      setSubStatus({ state: 'no-sub' });
    }
  }, []);

  useEffect(() => {
    refreshSubStatus();
  }, [refreshSubStatus]);

  // ----- Ack notifications + clear app badge -------------------------------
  // Le staff arrive sur la page notifications = il a vu ses notifs.
  // 1. POST /ack-all → marque acked_at = now() pour toutes ses deliveries
  //    non-ack'd. Le prochain push enverra unread_count = 0 + 1 = badge 1
  //    (pas N+1).
  // 2. On demande au SW de retirer le badge taskbar (effet immédiat sans
  //    attendre le prochain push).
  // Best-effort : si l'ack-all échoue (offline), le SW BG Sync replay le
  // POST plus tard ; le clear local s'applique quand même (rassurant).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await adminFetchJson('/api/admin/notifications/ack-all', {
          method: 'POST',
        });
      } catch {
        // Erreur réseau ou auth → on tente quand même le clear local du SW.
      }
      if (cancelled) return;
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then((reg) => {
            reg.active?.postMessage({ type: 'clear-app-badge' });
          })
          .catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminFetchJson]);

  // ----- Chargement des prefs ----------------------------------------------
  useEffect(() => {
    let cancelled = false;
    setLoadingPrefs(true);
    adminFetchJson<PrefsResponse>('/api/admin/notifications/prefs')
      .then((res) => {
        if (cancelled) return;
        setPrefs(res.prefs);
        setPrefsError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        logger.error('[admin/notifications] load prefs', err);
        setPrefsError((err as Error)?.message || t.errorLoadPrefs);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingPrefs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [adminFetchJson, t.errorLoadPrefs]);

  const prefsMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const p of prefs ?? []) m.set(p.event_type, p.enabled);
    return m;
  }, [prefs]);

  const togglePref = useCallback((event_type: WebPushEventType) => {
    setPrefs((prev) => {
      if (!prev) return prev;
      return prev.map((p) =>
        p.event_type === event_type ? { ...p, enabled: !p.enabled } : p
      );
    });
  }, []);

  const savePrefs = useCallback(async () => {
    if (!prefs || savingPrefs) return;
    setSavingPrefs(true);
    setPrefsError(null);
    try {
      const res = await adminFetchJson<PrefsResponse>(
        '/api/admin/notifications/prefs',
        {
          method: 'PUT',
          body: JSON.stringify({ prefs }),
        }
      );
      setPrefs(res.prefs);
      addToast(t.prefsSaved, 'success');
    } catch (err) {
      logger.error('[admin/notifications] save prefs', err);
      const msg = (err as Error)?.message || t.errorSave;
      setPrefsError(msg);
      addToast(msg, 'error');
    } finally {
      setSavingPrefs(false);
    }
  }, [adminFetchJson, addToast, prefs, savingPrefs, t.prefsSaved, t.errorSave]);

  // ----- Subscribe / unsubscribe ce device ---------------------------------
  const handleSubscribe = useCallback(async () => {
    if (subBusy) return;
    setSubBusy(true);
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        addToast(t.vapidMissing, 'error');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        addToast(
          permission === 'denied'
            ? t.permissionDenied
            : t.permissionNotGranted,
          'warning'
        );
        await refreshSubStatus();
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await adminFetchJson('/api/admin/notifications/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          user_agent: navigator.userAgent,
        }),
      });

      addToast(t.deviceSubscribed, 'success');
      await refreshSubStatus();
    } catch (err) {
      logger.error('[admin/notifications] subscribe', err);
      addToast((err as Error)?.message || t.errorSubscribe, 'error');
    } finally {
      setSubBusy(false);
    }
  }, [
    adminFetchJson,
    addToast,
    refreshSubStatus,
    subBusy,
    t.vapidMissing,
    t.permissionDenied,
    t.permissionNotGranted,
    t.deviceSubscribed,
    t.errorSubscribe,
  ]);

  const handleUnsubscribe = useCallback(async () => {
    if (subBusy) return;
    setSubBusy(true);
    try {
      const sub = await getActivePushSubscription();
      if (!sub) {
        addToast(t.noActiveSub, 'info');
        await refreshSubStatus();
        return;
      }
      const endpoint = sub.endpoint;

      // 1) Tente de révoquer côté navigateur d'abord. Si ça échoue, on
      //    continue quand même pour purger la table serveur.
      try {
        await sub.unsubscribe();
      } catch (_err) {
        // Ignore — on continue.
      }

      // 2) Purge la row côté serveur. Tolère 404 (la row n'existait déjà
      //    plus, l'opération est idempotente côté client).
      await adminFetchJson('/api/admin/notifications/unsubscribe', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint }),
      }).catch((err) => {
        // Tolère 404 : la row n'existait déjà plus, c'est ok.
        const status = (err as { status?: number })?.status;
        if (status !== 404) throw err;
      });

      addToast(t.deviceUnsubscribed, 'success');
      await refreshSubStatus();
    } catch (err) {
      logger.error('[admin/notifications] unsubscribe', err);
      addToast((err as Error)?.message || t.errorUnsubscribe, 'error');
    } finally {
      setSubBusy(false);
    }
  }, [
    adminFetchJson,
    addToast,
    refreshSubStatus,
    subBusy,
    t.noActiveSub,
    t.deviceUnsubscribed,
    t.errorUnsubscribe,
  ]);

  // ----- Test notification --------------------------------------------------
  const handleSendTest = useCallback(async () => {
    if (testing) return;
    setTesting(true);
    try {
      const res = await adminFetchJson<TestResponse>(
        '/api/admin/notifications/test',
        { method: 'POST' }
      );
      const { sent, expired_removed, failed } = res;
      const parts = [format(t.testSent, { count: sent })];
      if (expired_removed > 0)
        parts.push(format(t.testExpired, { count: expired_removed }));
      if (failed > 0) parts.push(format(t.testFailedCount, { count: failed }));
      addToast(
        format(t.testResult, { parts: parts.join(', ') }),
        failed > 0 ? 'warning' : 'success'
      );
    } catch (err) {
      logger.error('[admin/notifications] test', err);
      addToast((err as Error)?.message || t.testFailed, 'error');
    } finally {
      setTesting(false);
    }
  }, [
    adminFetchJson,
    addToast,
    testing,
    t.testSent,
    t.testExpired,
    t.testFailedCount,
    t.testResult,
    t.testFailed,
  ]);

  const statusInfo = formatStatusLabel(subStatus, t);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <p className="text-sm text-neutral-400">{t.kicker}</p>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">
          {t.heading}
        </h2>
        <p className="text-sm text-neutral-400 mt-2 max-w-2xl">{t.intro}</p>
      </div>

      {!pwaEnabled && (
        <AlertBanner variant="warning" message={t.pwaWarning} className="mb-6" />
      )}

      {/* ===== Section : État ===== */}
      <section
        className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6"
        data-testid="notifications-status-section"
      >
        <h2 className="text-xl font-semibold mb-1">{t.deviceStatusHeading}</h2>
        <p className="text-sm text-neutral-400 mb-4">
          {t.deviceStatusSubtitle}
        </p>

        <div className="flex items-center gap-3 mb-4">
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
              statusInfo.variant === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : statusInfo.variant === 'warning'
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                  : statusInfo.variant === 'error'
                    ? 'bg-red-500/15 border-red-500/30 text-red-300'
                    : 'bg-blue-500/15 border-blue-500/30 text-blue-300'
            }`}
            data-testid="notifications-status-pill"
          >
            {statusInfo.label}
          </span>
        </div>

        <div className="flex flex-wrap gap-3">
          {subStatus.state !== 'subscribed' && (
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={
                subBusy ||
                subStatus.state === 'unsupported' ||
                subStatus.state === 'denied'
              }
              className="px-4 py-2 bg-purple-500 hover:bg-purple-400 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="notifications-subscribe-btn"
            >
              {subBusy ? t.subscribing : t.subscribe}
            </button>
          )}
          {subStatus.state === 'subscribed' && (
            <button
              type="button"
              onClick={handleUnsubscribe}
              disabled={subBusy}
              className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              data-testid="notifications-unsubscribe-btn"
            >
              {subBusy ? t.unsubscribing : t.unsubscribe}
            </button>
          )}
          <button
            type="button"
            onClick={handleSendTest}
            disabled={testing || !pwaEnabled}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            data-testid="notifications-test-btn"
          >
            {testing ? t.testSending : t.sendTest}
          </button>
        </div>

        {subStatus.state === 'denied' && (
          <p className="text-xs text-amber-300 mt-4">{t.deniedHelp}</p>
        )}
      </section>

      {/* ===== Section : Préférences ===== */}
      <section
        className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6"
        data-testid="notifications-prefs-section"
      >
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">{t.prefsHeading}</h2>
            <p className="text-sm text-neutral-400">{t.prefsSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={savePrefs}
            disabled={loadingPrefs || savingPrefs || !prefs}
            className="px-4 py-2 bg-purple-500 hover:bg-purple-400 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="notifications-save-btn"
          >
            {savingPrefs ? t.savingPrefs : t.savePrefs}
          </button>
        </div>

        <AlertBanner
          message={prefsError}
          variant="error"
          className="mb-4"
          onDismiss={() => setPrefsError(null)}
        />

        {loadingPrefs && <LoadingSpinner label={t.loadingPrefs} />}

        {!loadingPrefs && prefs && (
          <div className="space-y-6">
            {getEventGroups(t).map((group) => (
              <div key={group.title}>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-300 mb-2">
                  {group.title}
                </h3>
                {group.description && (
                  <p className="text-xs text-neutral-500 mb-3">
                    {group.description}
                  </p>
                )}
                <ul className="divide-y divide-neutral-700/50 rounded-lg border border-neutral-700/50 overflow-hidden">
                  {group.events.map((evt) => {
                    const enabled = prefsMap.get(evt.type) ?? true;
                    return (
                      <li
                        key={evt.type}
                        className="flex items-center justify-between gap-3 px-4 py-3 bg-neutral-900/40"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white">
                            {evt.label}
                          </p>
                          {evt.hint && (
                            <p className="text-xs text-neutral-500 mt-0.5">
                              {evt.hint}
                            </p>
                          )}
                          <p className="text-[10px] uppercase tracking-wide text-neutral-600 mt-1 font-mono">
                            {evt.type}
                          </p>
                        </div>
                        <label
                          className="relative inline-flex items-center cursor-pointer flex-shrink-0"
                          data-testid={`pref-toggle-${evt.type}`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={enabled}
                            onChange={() => togglePref(evt.type)}
                            aria-label={format(t.toggleAria, {
                              label: evt.label,
                            })}
                          />
                          <span
                            className="w-11 h-6 bg-neutral-700 rounded-full peer
                              peer-checked:bg-purple-500
                              peer-focus:ring-2 peer-focus:ring-purple-500/50
                              transition-colors"
                          />
                          <span
                            className="absolute left-0.5 top-0.5 bg-white w-5 h-5 rounded-full
                              transition-transform peer-checked:translate-x-5"
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
