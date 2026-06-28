import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useRealtimeChannel } from '@/hooks/useRealtimeChannel';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useT, format } from '@/lib/i18n/useT';

type Notifications = {
  hasTeam: boolean;
  isCaptain: boolean;
  captainTeamId: string | null;
  memberTeamId: string | null;
  unreadMessages: number;
  pendingScrims: number;
  pendingJoinRequests: number;
  checkinPending: 0 | 1;
  total: number;
};

const POLL_MS = 90_000;

export default function PlayerBell(): JSX.Element | null {
  const { user, loading } = useAuthSession();
  const { adminFetchJson } = useAdminFetch();
  const t = useT('playerBell');
  const [data, setData] = useState<Notifications | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const json = await adminFetchJson<Notifications>(
        '/api/player/notifications',
        { skipAuthRedirect: true }
      );
      setData(json);
    } catch {
      /* offline / network — keep last known counts */
    }
  }, [adminFetchJson]);

  useEffect(() => {
    if (!user) return undefined;
    load();
    intervalRef.current = setInterval(() => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      )
        return;
      load();
    }, POLL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user, load]);

  // Realtime: refresh counts as soon as Postgres notifies of an inbound
  // demande on the captain's team. Polling stays as a safety net for
  // dropped connections.
  const teamFilterId = data?.captainTeamId ?? null;
  useRealtimeChannel({
    enabled: !!user && !!teamFilterId,
    channel: teamFilterId ? `bell-demandes-${teamFilterId}` : 'bell-demandes',
    table: 'demandes',
    filter: teamFilterId ? `team_id=eq.${teamFilterId}` : undefined,
    onChange: load,
  });

  if (loading || !user) return null;

  const total = data?.total ?? 0;
  const showBadge = total > 0;
  const tooltip = data
    ? [
        data.unreadMessages
          ? format(
              data.unreadMessages > 1 ? t.messages_other : t.messages_one,
              { count: data.unreadMessages }
            )
          : null,
        data.pendingScrims
          ? format(data.pendingScrims > 1 ? t.scrims_other : t.scrims_one, {
              count: data.pendingScrims,
            })
          : null,
        data.pendingJoinRequests
          ? format(
              data.pendingJoinRequests > 1
                ? t.candidatures_other
                : t.candidatures_one,
              { count: data.pendingJoinRequests }
            )
          : null,
        data.checkinPending ? t.checkinPending : null,
      ]
        .filter(Boolean)
        .join(' · ') || t.empty
    : t.title;

  return (
    <Link
      href="/player"
      title={tooltip}
      aria-label={format(t.ariaLabel, { tooltip })}
      className="group/bell relative ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-neutral-200 backdrop-blur-md transition-all hover:border-white/20 hover:bg-white/[0.08] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
      </svg>
      {showBadge && (
        <span
          className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-[18px] text-white"
          aria-hidden="true"
        >
          {total > 99 ? '99+' : total}
        </span>
      )}
    </Link>
  );
}
