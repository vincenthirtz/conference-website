// pages/player/notifications.tsx
// Espace joueur — "Notifications".
//   (a) "En attente" : compteurs actionnables (GET /api/player/notifications).
//   (b) "Preferences" : opt-in push (PushOptIn) + toggles par event_type
//       (GET/PUT /api/player/push/prefs).
// Pas de feed d'historique : la PWA ne stocke pas les notifications passees.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useT } from '@/lib/i18n/useT';
import PushOptIn from '@/components/shared/PushOptIn';
import NotificationPrefsGrid from '@/components/player/NotificationPrefsGrid';
import QuickAction, {
  type QuickActionProps,
} from '@/components/player/QuickAction';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import InvitationsSection from '@/components/player/InvitationsSection';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import type { PlayerNotificationsPayload } from '@/pages/api/player/notifications';

import { logger } from '../../utils/logger';

// Réponse du GET /api/player/push/prefs : deux maps event_type -> bool.
// `push` = opt-OUT (clé absente => activé). `email` = opt-IN (clé absente =>
// désactivé). Les deux maps peuvent couvrir des ensembles d'event_types
// DIFFÉRENTS — on rend les clés propres à chaque map.
type NotificationChannel = 'push' | 'email';
type PrefsResponse = {
  push: Record<string, boolean>;
  email: Record<string, boolean>;
};

const SVG_PATHS = {
  messages: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  scrim: 'M22 12a10 10 0 11-20 0 10 10 0 0120 0zM10 8l6 4-6 4z',
  team: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100 8 4 4 0 000-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  checkin: 'M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
};

function PlayerNotifications() {
  const {
    user,
    loading: authLoading,
    ready,
  } = usePlayerSession({
    redirectTo: '/login?next=/player/notifications',
  });
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { addToast } = useToast();
  const t = useT('playerNotifications');

  const [loading, setLoading] = useState(true);
  const [counters, setCounters] = useState<PlayerNotificationsPayload | null>(
    null
  );
  const [prefs, setPrefs] = useState<PrefsResponse | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [countersData, prefsData] = await Promise.all([
      adminFetchJson<PlayerNotificationsPayload>('/api/player/notifications', {
        skipAuthRedirect: true,
      }).catch((err) => {
        logger.error('[player/notifications] counters error:', err);
        return null;
      }),
      adminFetchJson<PrefsResponse>('/api/player/push/prefs', {
        skipAuthRedirect: true,
      }).catch((err) => {
        logger.error('[player/notifications] prefs error:', err);
        return null;
      }),
    ]);

    if (countersData) setCounters(countersData);
    if (prefsData) {
      setPrefs({
        push: prefsData.push ?? {},
        email: prefsData.email ?? {},
      });
    }
    if (!countersData && !prefsData) {
      setError(t.loadError);
    }
  }, [adminFetchJson, t]);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [ready, load]);

  const handleToggle = async (
    eventType: string,
    channel: NotificationChannel,
    nextEnabled: boolean
  ) => {
    const saveKey = `${channel}:${eventType}`;
    setSavingKey(saveKey);
    // Optimistic update + snapshot pour rollback.
    const previous = prefs;
    setPrefs((current) =>
      current
        ? {
            ...current,
            [channel]: { ...current[channel], [eventType]: nextEnabled },
          }
        : current
    );
    try {
      await adminFetchJson('/api/player/push/prefs', {
        method: 'PUT',
        body: JSON.stringify({ eventType, channel, enabled: nextEnabled }),
      });
      addToast(t.prefSaved, 'success');
    } catch (err) {
      logger.error('[player/notifications] toggle error:', err);
      setPrefs(previous);
      addToast((err as Error)?.message || t.prefSaveError, 'error');
    } finally {
      setSavingKey(null);
    }
  };

  if (authLoading || (loading && !counters && prefs === null)) {
    return <PlayerPageSkeleton rows={2} />;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="max-w-md mx-auto px-4 py-10 pt-32 text-center">
          <h1 className="text-3xl font-bold text-gradient">{t.pageTitle}</h1>
          <p className="mt-4 text-gray-300">{t.signedOutIntro}</p>
          <Link
            href="/login?next=/player/notifications"
            className="mt-8 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-pink-500 to-purple-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-purple-500/20 transition hover:brightness-110"
          >
            {t.signIn}
          </Link>
        </main>
      </div>
    );
  }

  const actions: QuickActionProps[] = [];
  if (counters) {
    if (counters.unreadMessages > 0) {
      actions.push({
        href: '/player/messages',
        label: t.unreadMessages,
        description: t.unreadMessagesDesc,
        iconPath: SVG_PATHS.messages,
        tone: 'emerald',
        badge: counters.unreadMessages,
      });
    }
    if (counters.pendingScrims > 0) {
      actions.push({
        href: '/player',
        label: t.pendingScrims,
        description: t.pendingScrimsDesc,
        iconPath: SVG_PATHS.scrim,
        tone: 'blue',
        badge: counters.pendingScrims,
      });
    }
    if (counters.pendingJoinRequests > 0) {
      actions.push({
        href: '/player/manage-team',
        label: t.joinRequests,
        description: t.joinRequestsDesc,
        iconPath: SVG_PATHS.team,
        tone: 'purple',
        badge: counters.pendingJoinRequests,
      });
    }
    if (counters.checkinPending > 0) {
      actions.push({
        href: '/player/checkin',
        label: t.checkinPending,
        description: t.checkinPendingDesc,
        iconPath: SVG_PATHS.checkin,
        tone: 'cyan',
      });
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="max-w-3xl mx-auto px-4 py-10 pt-24 pb-16">
        <div className="mb-8">
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <Link href="/player" className="hover:text-white transition">
              &larr; {t.backToDashboard}
            </Link>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gradient mt-2">
            {t.pageTitle}
          </h1>
          <p className="text-sm text-gray-400 mt-2">{t.intro}</p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="space-y-8">
          {/* (a) Invitations reçues — masquée s'il n'y en a aucune. */}
          <InvitationsSection />

          {/* (b) En attente */}
          <section>
            <h2 className="text-lg font-semibold mb-4 text-white">
              {t.pendingHeading}
            </h2>
            {actions.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {actions.map((action) => (
                  <QuickAction
                    key={action.href + action.iconPath}
                    {...action}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 text-center">
                <p className="text-sm font-medium text-white">
                  {t.allUpToDate}
                </p>
                <p className="mt-1 text-xs text-gray-400">{t.noPending}</p>
              </div>
            )}
          </section>

          {/* (c) Preferences */}
          <section>
            <h2 className="text-lg font-semibold mb-4 text-white">
              {t.prefsHeading}
            </h2>

            <div className="mb-4">
              <PushOptIn audience="player" variant="card" loginPath="/login" />
            </div>

            <NotificationPrefsGrid
              prefs={prefs}
              savingKey={savingKey}
              onToggle={handleToggle}
            />

            <p className="text-xs text-gray-500 mt-3">{t.prefsFootnote}</p>
          </section>
        </div>
      </main>
    </div>
  );
}

const playerNotificationsSeo: SeoProps = {
  title: {
    fr: 'Notifications',
    en: 'Notifications',
  },
  description: {
    fr: 'Tes actions en attente et tes préférences de notifications push.',
    en: 'Your pending actions and push notification preferences.',
  },
  noindex: true,
};

PlayerNotifications.seo = playerNotificationsSeo;

export default PlayerNotifications;
