// components/overlay/SponsorRotator.tsx
//
// Unobtrusive corner slot that cycles through active sponsors, one at a time,
// with a soft crossfade. Pure client-side timer — no backend.
//
//   - 0 sponsors → renders nothing.
//   - 1 sponsor  → static (no timer).
//   - 2+         → rotates every `intervalMs` (default 6s), fading between.
//
// Cleans its interval up on unmount / list change (may run for hours in OBS).

import { useEffect, useState } from 'react';
import type { OverlaySponsor } from '@/hooks/useOverlayState';
import { useT } from '@/lib/i18n/useT';

type Props = {
  sponsors: OverlaySponsor[];
  /** Rotation cadence in ms (default 6s). */
  intervalMs?: number;
  className?: string;
};

export function SponsorRotator({
  sponsors,
  intervalMs = 6_000,
  className = '',
}: Props) {
  const t = useT('overlay');
  const [index, setIndex] = useState(0);
  const count = sponsors.length;

  // Rotate only when there is more than one sponsor.
  useEffect(() => {
    if (count <= 1) return undefined;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, intervalMs);
    return () => clearInterval(id);
  }, [count, intervalMs]);

  // Keep the index in range if the sponsor list shrinks between refetches.
  useEffect(() => {
    setIndex((i) => (count > 0 ? i % count : 0));
  }, [count]);

  if (count === 0) return null;

  const current = sponsors[Math.min(index, count - 1)];

  return (
    <div
      className={`pointer-events-none flex flex-col items-center gap-1 ${className}`}
      aria-hidden="true"
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/50">
        {t.sponsors}
      </span>
      <div className="flex h-16 w-44 items-center justify-center rounded-xl border border-white/10 bg-black/55 px-4 backdrop-blur-sm">
        {/* key on index → remount triggers the fade-in animation */}
        <div
          key={index}
          className="sponsor-fade flex items-center justify-center"
        >
          {current.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.logoUrl}
              alt={current.name}
              className="max-h-12 max-w-40 object-contain"
              loading="lazy"
            />
          ) : (
            <span className="text-sm font-bold text-white">{current.name}</span>
          )}
        </div>
      </div>
      <style jsx>{`
        .sponsor-fade {
          animation: sponsor-fade-in 0.7s ease-out;
        }
        @keyframes sponsor-fade-in {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
