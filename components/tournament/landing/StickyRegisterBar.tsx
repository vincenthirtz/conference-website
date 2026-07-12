// components/tournament/landing/StickyRegisterBar.tsx
//
// Barre de conversion collante (mobile + desktop) : apparaît après que le hero
// a défilé hors-champ, rappelle les places restantes et le CTA d'inscription.
// Se masque d'elle-même si les inscriptions sont fermées.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';

export default function StickyRegisterBar({
  registrationOpen,
  registerHref,
  placesRemaining,
}: {
  registrationOpen: boolean;
  registerHref: string;
  placesRemaining: number | null;
}) {
  const t = useT('tournamentLanding');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!registrationOpen) return;
    const onScroll = () => setVisible(window.scrollY > 640);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [registrationOpen]);

  if (!registrationOpen) return null;

  const placesLabel =
    placesRemaining !== null && placesRemaining > 0
      ? (placesRemaining > 1 ? t.stickyPlaces_other : t.stickyPlaces_one).replace(
          '{count}',
          String(placesRemaining)
        )
      : null;

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
      aria-hidden={!visible}
    >
      <div className="mx-auto mb-3 w-[min(100%-1.5rem,64rem)] rounded-2xl border border-white/12 bg-[#0d0520]/90 px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">
              {t.finalHeading}
            </p>
            {placesLabel && (
              <p className="truncate text-[11px] text-[var(--color-green-light)]">
                {placesLabel}
              </p>
            )}
          </div>
          <Link href={registerHref} className="shrink-0" tabIndex={visible ? 0 : -1}>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[var(--color-green)] to-[var(--color-yellow)] px-5 py-2.5 text-xs font-bold text-black transition-transform hover:scale-[1.03]">
              {t.stickyRegister}
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
