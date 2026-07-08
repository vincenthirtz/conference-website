// Client-only ticker (fetch + animations)
'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRef } from 'react';
import { useT, format } from '@/lib/i18n/useT';

import { logger } from '../../utils/logger';
export type Announcement = {
  id: string;
  title: string;
  message: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
};

const SWITCH_MS = 6000;
const MARQUEE_SPEED_S = 16;
const REFRESH_MS = 5 * 60_000;

type AnnouncementsTickerProps = {
  initialItems?: Announcement[];
};

export default function AnnouncementsTicker({
  initialItems = [],
}: AnnouncementsTickerProps) {
  const t = useT('announcementsTicker');
  const [items, setItems] = useState<Announcement[]>(initialItems);
  const [index, setIndex] = useState(0);
  const [animationReady, setAnimationReady] = useState(false);
  const hasInitialItems = initialItems.length > 0;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch('/api/announcements?limit=6');
        const json = await res.json();
        if (mounted && json?.items?.length > 0) {
          setItems(json.items);
        }
      } catch (e) {
        logger.error('announcements load error', e);
      }
    };
    if (!hasInitialItems) {
      load();
    }
    const refreshTimer = setInterval(load, REFRESH_MS);
    return () => {
      mounted = false;
      clearInterval(refreshTimer);
    };
  }, [hasInitialItems]);

  useEffect(() => {
    if (items.length <= 1) return undefined;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, SWITCH_MS);
    return () => clearInterval(timer);
  }, [items.length]);

  useEffect(() => {
    const t = setTimeout(() => setAnimationReady(true), 800);
    return () => clearTimeout(t);
  }, []);

  const current = useMemo(
    () => (items.length ? items[index % items.length] : null),
    [items, index]
  );

  if (!current) return null;

  return (
    <div className="w-full px-4 mt-6">
      <div className="relative overflow-hidden rounded-2xl border border-[var(--color-violet)]/35 bg-gradient-to-r from-[#0f172a] via-[#111827] to-[#0b1220] shadow-2xl px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 min-w-0 h-8 overflow-hidden">
            <div
              key={current.id}
              className="absolute inset-0 flex items-center gap-3 whitespace-nowrap animate-marquee"
              style={{
                animationDuration: `${MARQUEE_SPEED_S}s`,
                animationPlayState: animationReady ? 'running' : 'paused',
              }}
            >
              <p className="text-sm font-semibold text-white">
                {current.title}
              </p>
              <span className="text-sm text-gray-400">—</span>
              <p className="text-sm text-gray-100">{current.message}</p>
            </div>
          </div>
          {current.ctaUrl && (
            <Link
              href={current.ctaUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-[var(--color-violet)] text-white px-3 py-1.5 text-xs font-semibold shadow transition hover:-translate-y-0.5 hover:bg-[var(--color-violet-deep)] hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
            >
              {current.ctaLabel || t.discover}
              <span aria-hidden>↗</span>
            </Link>
          )}
        </div>

        {items.length > 1 && (
          <div className="absolute right-3 bottom-2 flex items-center gap-2">
            {items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndex(i)}
                className={`h-1 rounded-full transition-all ${
                  i === index ? 'w-4 bg-[var(--color-violet-light)]' : 'w-2 bg-white/40'
                }`}
                aria-label={format(t.goToAnnouncement, { n: i + 1 })}
              />
            ))}
          </div>
        )}
      </div>
      <style jsx>{`
        @keyframes marquee {
          0% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(-100%);
          }
        }
        .animate-marquee {
          animation-name: marquee;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
      `}</style>
    </div>
  );
}
