// components/Navbar/PlayerTopBarBell.tsx — la cloche de l'espace joueuse, sortie de
// PlayerTopBar (lot P8, docs/PLAN-industrialisation-joueur.md : la barre de
// 493 lignes est scindée). Comportement inchangé : compteur de l'équipe
// ACTIVE, relevé toutes les 90 s tant que l'onglet est visible, et
// immédiatement au retour.
//
// Rendue UNE seule fois, dans la barre du haut (visible mobile + desktop) :
// la coquille `PlayerShell` n'en pose pas de seconde — deux liens « Notifications (…) »
// feraient annoncer deux fois le compteur, et casseraient les sélecteurs e2e.
//
// Reste hors de `features/player` : la barre est atteinte par `_app` (import
// dynamique de navbar.tsx), et le bundle public ne doit pas tirer le cache
// joueuse (tests/unit/adminBoundariesGuard.test.ts).

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
// Type seul (effacé) : inboxTypes.ts n'importe que des types, hors TanStack —
// le bundle public reste intact (tests/unit/adminBoundariesGuard.test.ts).
import type { PlayerNotificationsWithInbox } from '@/features/player/notifications/inboxTypes';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useDocumentVisible } from '@/hooks/useDocumentVisible';
import { useActiveTeam } from '@/components/player/ActiveTeamContext';
import { PLAYER_NOTIFICATIONS_CHANGED } from '@/utils/player/notificationsEvents';
import { useT, format } from '@/lib/i18n/useT';
import nsPlayerTopBar from '@/lib/i18n/locales/fr/playerTopBar';
import { type BellCounts, playerBellCounts } from './playerBellCounts';

const POLL_MS = 90_000;

/**
 * Ce que compte la cloche (null : pas encore lu) : actions en attente de
 * l'équipe active + notifications non lues de la boîte (lot 4,
 * ./playerBellCounts.ts).
 */
export function usePlayerNotificationCounts(): BellCounts | null {
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  // La cloche compte pour l'équipe ACTIVE, comme le tableau de bord et
  // /player/notifications : c'est la raison pour laquelle ActiveTeamProvider
  // enveloppe toute l'application (cf. _app.tsx). Sans `withTeam`, un manager
  // multi-équipes voyait le compteur de sa première équipe quelle que soit
  // celle choisie.
  const { withTeam } = useActiveTeam();
  const [counts, setCounts] = useState<BellCounts | null>(null);
  const visible = useDocumentVisible();

  const poll = useCallback(async () => {
    try {
      const json = await adminFetchJson<PlayerNotificationsWithInbox>(
        withTeam('/api/player/notifications'),
        { skipAuthRedirect: true }
      );
      if (typeof json?.total === 'number') setCounts(playerBellCounts(json));
    } catch {
      // silent — pas d'incidence sur l'UX si ça plante
    }
  }, [adminFetchJson, withTeam]);

  // Onglet caché = pas de poll. Au retour, l'effet se relance et rafraîchit
  // IMMÉDIATEMENT le compteur, au lieu d'attendre le prochain cycle de 90 s.
  useEffect(() => {
    if (!visible) return undefined;
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => clearInterval(interval);
  }, [poll, visible]);

  // Notifications d'équipe marquées lues sur /player/notifications : le
  // compteur se relit tout de suite (utils/player/notificationsEvents.ts).
  useEffect(() => {
    const onChanged = () => {
      void poll();
    };
    window.addEventListener(PLAYER_NOTIFICATIONS_CHANGED, onChanged);
    return () =>
      window.removeEventListener(PLAYER_NOTIFICATIONS_CHANGED, onChanged);
  }, [poll]);

  return counts;
}

/** Le chiffre de la pastille (null : pas encore lu). */
export function usePlayerNotificationCount(): number | null {
  return usePlayerNotificationCounts()?.total ?? null;
}

type TopBarDict = (typeof nsPlayerTopBar)['fr'];

/**
 * Libellé accessible : « Notifications (3 actions, 2 nouvelles
 * notifications) » ; sans notification non lue, le libellé d'avant
 * (« Notifications (3 en attente) »).
 */
export function bellLabel(counts: BellCounts | null, t: TopBarDict): string {
  if (!counts || counts.total === 0) return t.bellEmpty;
  if (counts.unread === 0) {
    return format(t.bellPending, { count: counts.pending });
  }
  const parts: string[] = [];
  if (counts.pending > 0) {
    parts.push(
      format(counts.pending > 1 ? t.bellActions_other : t.bellActions_one, {
        count: counts.pending,
      })
    );
  }
  parts.push(
    format(counts.unread > 1 ? t.bellUnread_other : t.bellUnread_one, {
      count: counts.unread,
    })
  );
  return format(t.bellSummary, { summary: parts.join(', ') });
}

function BellIcon() {
  return (
    <svg
      aria-hidden
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}

export default function PlayerTopBarBell() {
  const t = useT(nsPlayerTopBar);
  const counts = usePlayerNotificationCounts();
  const notifTotal = counts?.total ?? 0;
  const hasNotifs = notifTotal > 0;
  const badge = notifTotal > 99 ? '99+' : notifTotal;
  const label = bellLabel(counts, t);

  return (
    <Link
      prefetch={false}
      href="/player/notifications"
      aria-label={label}
      className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-neutral-300 transition-all hover:bg-white/[0.06] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
    >
      <BellIcon />
      {hasNotifs && (
        <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-r from-pink-500 to-purple-500 px-1 text-[10px] font-bold leading-none text-white shadow-[0_0_0_2px_rgba(178,75,224,0.25)]">
          {badge}
        </span>
      )}
    </Link>
  );
}
