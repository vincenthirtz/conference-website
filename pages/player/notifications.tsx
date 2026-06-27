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
import PushOptIn from '@/components/shared/PushOptIn';
import QuickAction, {
  type QuickActionProps,
} from '@/components/player/QuickAction';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import type { PlayerNotificationsPayload } from '@/pages/api/player/notifications';
import {
  PLAYER_PUSH_EVENT_TYPES,
  type PlayerPushEventType,
} from '@/utils/webPushEvents';

import { logger } from '../../utils/logger';

type PrefRow = { event_type: string; enabled: boolean };

const EVENT_LABELS: Record<PlayerPushEventType, string> = {
  'match.starting': 'Match imminent',
  'match.finished': 'Match terminé',
  'match.score_reported': 'Score reporté',
  'checkin.opened': 'Ouverture du check-in',
  'scrim.invitation': 'Invitation à un scrim',
  'scrim.confirmed': 'Scrim confirmé',
  'team.forfeit': 'Forfait d’équipe',
  'news.published': 'Nouvelle actualité',
};

const EVENT_DESCRIPTIONS: Record<PlayerPushEventType, string> = {
  'match.starting': 'Quand un de tes matchs va bientôt commencer.',
  'match.finished': 'Quand un de tes matchs se termine.',
  'match.score_reported': 'Quand un score est reporté sur un de tes matchs.',
  'checkin.opened': 'Quand la fenêtre de check-in s’ouvre.',
  'scrim.invitation': 'Quand ton équipe reçoit une invitation à un scrim.',
  'scrim.confirmed': 'Quand un scrim est confirmé.',
  'team.forfeit': 'Quand un forfait concerne ton équipe.',
  'news.published': 'Quand une actualité est publiée.',
};

const SVG_PATHS = {
  messages: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  scrim: 'M22 12a10 10 0 11-20 0 10 10 0 0120 0zM10 8l6 4-6 4z',
  team: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100 8 4 4 0 000-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  checkin: 'M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
};

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-purple-500' : 'bg-white/15'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

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

  const [loading, setLoading] = useState(true);
  const [counters, setCounters] = useState<PlayerNotificationsPayload | null>(
    null
  );
  const [prefs, setPrefs] = useState<PrefRow[]>([]);
  const [savingType, setSavingType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [countersData, prefsData] = await Promise.all([
      adminFetchJson<PlayerNotificationsPayload>('/api/player/notifications', {
        skipAuthRedirect: true,
      }).catch((err) => {
        logger.error('[player/notifications] counters error:', err);
        return null;
      }),
      adminFetchJson<{ prefs: PrefRow[] }>('/api/player/push/prefs', {
        skipAuthRedirect: true,
      }).catch((err) => {
        logger.error('[player/notifications] prefs error:', err);
        return null;
      }),
    ]);

    if (countersData) setCounters(countersData);
    if (prefsData) setPrefs(prefsData.prefs ?? []);
    if (!countersData && !prefsData) {
      setError('Erreur lors du chargement de tes notifications.');
    }
  }, [adminFetchJson]);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [ready, load]);

  const handleToggle = async (eventType: string, nextEnabled: boolean) => {
    setSavingType(eventType);
    // Optimistic update.
    const previous = prefs;
    setPrefs((rows) =>
      rows.map((r) =>
        r.event_type === eventType ? { ...r, enabled: nextEnabled } : r
      )
    );
    try {
      const res = await adminFetchJson<{ prefs: PrefRow[] }>(
        '/api/player/push/prefs',
        {
          method: 'PUT',
          body: JSON.stringify({
            prefs: [{ event_type: eventType, enabled: nextEnabled }],
          }),
        }
      );
      setPrefs(res.prefs ?? []);
      addToast('Préférence enregistrée.', 'success');
    } catch (err) {
      logger.error('[player/notifications] toggle error:', err);
      setPrefs(previous);
      addToast(
        (err as Error)?.message || 'Impossible d’enregistrer la préférence.',
        'error'
      );
    } finally {
      setSavingType(null);
    }
  };

  if (authLoading || (loading && !counters && prefs.length === 0)) {
    return <PlayerPageSkeleton rows={2} />;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="max-w-md mx-auto px-4 py-10 pt-32 text-center">
          <h1 className="text-3xl font-bold text-gradient">Notifications</h1>
          <p className="mt-4 text-gray-300">
            Connecte-toi pour gérer tes notifications.
          </p>
          <Link
            href="/login?next=/player/notifications"
            className="mt-8 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-pink-500 to-purple-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-purple-500/20 transition hover:brightness-110"
          >
            Se connecter
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
        label: 'Messages non lus',
        description: 'Discussions entre capitaines',
        iconPath: SVG_PATHS.messages,
        tone: 'emerald',
        badge: counters.unreadMessages,
      });
    }
    if (counters.pendingScrims > 0) {
      actions.push({
        href: '/player',
        label: 'Demandes de scrim',
        description: 'À traiter sur le tableau de bord',
        iconPath: SVG_PATHS.scrim,
        tone: 'blue',
        badge: counters.pendingScrims,
      });
    }
    if (counters.pendingJoinRequests > 0) {
      actions.push({
        href: '/player/manage-team',
        label: 'Demandes d’adhésion',
        description: 'Rejoindre ton équipe',
        iconPath: SVG_PATHS.team,
        tone: 'purple',
        badge: counters.pendingJoinRequests,
      });
    }
    if (counters.checkinPending > 0) {
      actions.push({
        href: '/player/checkin',
        label: 'Check-in à valider',
        description: 'Valide ta présence',
        iconPath: SVG_PATHS.checkin,
        tone: 'cyan',
      });
    }
  }

  const prefMap = new Map(prefs.map((p) => [p.event_type, p.enabled]));

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="max-w-3xl mx-auto px-4 py-10 pt-24 pb-16">
        <div className="mb-8">
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <Link href="/player" className="hover:text-white transition">
              &larr; Tableau de bord
            </Link>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gradient mt-2">
            Notifications
          </h1>
          <p className="text-sm text-gray-400 mt-2">
            Tes actions en attente et tes préférences de notifications push.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="space-y-8">
          {/* (a) En attente */}
          <section>
            <h2 className="text-lg font-semibold mb-4 text-white">
              En attente
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
                  Tout est à jour ✓
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Tu n&apos;as aucune action en attente.
                </p>
              </div>
            )}
          </section>

          {/* (b) Preferences */}
          <section>
            <h2 className="text-lg font-semibold mb-4 text-white">
              Préférences de notifications
            </h2>

            <div className="mb-4">
              <PushOptIn audience="player" variant="card" loginPath="/login" />
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl divide-y divide-white/[0.06]">
              {PLAYER_PUSH_EVENT_TYPES.map((eventType) => {
                const enabled = prefMap.get(eventType) ?? true;
                return (
                  <div
                    key={eventType}
                    className="flex items-center justify-between gap-4 px-5 py-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">
                        {EVENT_LABELS[eventType]}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {EVENT_DESCRIPTIONS[eventType]}
                      </p>
                    </div>
                    <Toggle
                      checked={enabled}
                      disabled={savingType === eventType}
                      onChange={() => handleToggle(eventType, !enabled)}
                      label={EVENT_LABELS[eventType]}
                    />
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Ces réglages s&apos;appliquent aux notifications push du
              navigateur. Active d&apos;abord les notifications ci-dessus pour
              les recevoir.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

const playerNotificationsSeo: SeoProps = {
  title: 'Notifications',
  description:
    'Tes actions en attente et tes préférences de notifications push.',
  noindex: true,
};

PlayerNotifications.seo = playerNotificationsSeo;

export default PlayerNotifications;
