// components/Home/HomeHeroV2.tsx
//
// Hero recentré de la refonte accueil : titre gradient, tagline courte, UNE CTA
// primaire (Inscrire mon équipe → /team/create) + Discord en secondaire, et une
// pastille de statut INTÉGRÉE qui fusionne le libellé live/prochain rendez-vous
// et le compte à rebours (plus de bande countdown séparée).
//
// La logique de timer reprend celle de `HomeCountdown` : on démarre à null pour
// que SSR et premier rendu client concordent (pas de CLS / d'hydration
// mismatch), puis on calcule côté client dans un effet. Réduit-motion safe.

import { useEffect, useState, type JSX } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';

type HomeHeroV2Props = {
  /** ISO du prochain jalon (coup d'envoi / ouverture des matchs). */
  countdownTarget: string | null;
  /** Vrai quand une diffusion Twitch est en cours (pastille "en direct"). */
  isLive?: boolean;
};

type Parts = { days: number; hours: number; minutes: number; seconds: number };

function diffParts(target: number, now: number): Parts | null {
  const ms = target - now;
  if (ms <= 0) return null;
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  const hours = Math.floor(ms / (1000 * 60 * 60)) % 24;
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  return { days, hours, minutes, seconds };
}

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

const DISCORD_URL = 'https://discord.gg/gERSsjC3Vd';

export default function HomeHeroV2({
  countdownTarget,
  isLive = false,
}: HomeHeroV2Props): JSX.Element {
  const t = useT('homeV2');
  const currentYear = new Date().getFullYear();

  const targetMs = countdownTarget ? new Date(countdownTarget).getTime() : NaN;
  const isValidTarget = Number.isFinite(targetMs);

  const [parts, setParts] = useState<Parts | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!isValidTarget) return undefined;
    setMounted(true);
    const tick = () => setParts(diffParts(targetMs, Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isValidTarget, targetMs]);

  // Libellé de la pastille : "en direct" prime, sinon compte à rebours si un
  // jalon valide et à venir existe, sinon rien (la pastille disparaît).
  const showCountdown = isValidTarget && (!mounted || Boolean(parts));
  const cells: { value: number; label: string }[] = parts
    ? [
        { value: parts.days, label: t.cdDays },
        { value: parts.hours, label: t.cdHours },
        { value: parts.minutes, label: t.cdMinutes },
        { value: parts.seconds, label: t.cdSeconds },
      ]
    : [];

  return (
    <header className="hero-section relative isolate overflow-hidden text-center">
      <div className="hero-aurora" aria-hidden="true">
        <span className="hero-aurora__violet" />
      </div>

      <div className="container mx-auto flex flex-col items-center px-4 pb-14 pt-20 sm:pt-24 md:pt-28 md:pb-16">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
          {t.heroEyebrow}
        </p>

        <h1 className="text-gradient mx-auto mt-4 max-w-[14ch] text-balance text-4xl font-extrabold uppercase leading-[0.98] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
          OW WOMEN&apos;S CUP {currentYear}
        </h1>

        <p className="mt-5 max-w-[46ch] text-base text-gray-300 sm:text-lg">
          {t.heroTagline}{' '}
          <span className="font-medium text-white">{t.heroTaglineStrong}</span>
        </p>

        <div className="mt-8 flex w-full max-w-md flex-col items-center justify-center gap-3 sm:max-w-none sm:flex-row sm:gap-4">
          <Link href="/team/create" className="w-full sm:w-auto">
            <button
              type="button"
              className="esport-cta group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl px-6 py-3.5 text-base font-extrabold uppercase tracking-wider text-white shadow-2xl transition-all duration-300 hover:scale-105 sm:w-auto sm:px-8 sm:py-4 sm:text-lg"
            >
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              <span className="relative">{t.heroCtaRegister}</span>
              <svg
                className="relative h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 sm:h-5 sm:w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </Link>
          <Link
            href={DISCORD_URL}
            target="_blank"
            rel="noreferrer"
            className="w-full sm:w-auto"
          >
            <button
              type="button"
              className="hero-secondary-btn hero-secondary-btn--violet group flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-medium text-white backdrop-blur transition-all duration-300 sm:w-auto sm:px-6 sm:text-base"
            >
              <svg
                className="h-4 w-4 transition-transform duration-300 group-hover:scale-110 sm:h-5 sm:w-5"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
              {t.heroCtaDiscord}
            </button>
          </Link>
        </div>

        {(isLive || showCountdown) && (
          <div
            className="mt-8 inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-full border border-white/10 bg-[var(--bg-elevated)]/60 py-2.5 pl-4 pr-2.5 backdrop-blur"
            aria-live="polite"
          >
            <span className="inline-flex items-center gap-2 text-[13px] font-semibold tracking-wide">
              <span className="relative flex h-2 w-2" aria-hidden>
                <span
                  className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${
                    isLive
                      ? 'motion-safe:animate-ping bg-rose-400'
                      : 'motion-safe:animate-ping bg-[var(--color-yellow)]'
                  }`}
                />
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${
                    isLive ? 'bg-rose-500' : 'bg-[var(--color-yellow)]'
                  }`}
                />
              </span>
              {isLive ? t.statusLive : t.statusNext}
            </span>

            {!isLive && showCountdown && (
              <span className="inline-flex gap-1.5">
                {parts
                  ? cells.map(({ value, label }) => (
                      <span
                        key={label}
                        className="flex min-w-[46px] flex-col items-center rounded-lg border border-white/10 bg-white/5 px-2 py-1"
                      >
                        <span className="text-lg font-extrabold leading-none tabular-nums text-white">
                          {pad(value)}
                        </span>
                        <span className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-gray-400">
                          {label}
                        </span>
                      </span>
                    ))
                  : // Slot réservé pré-hydratation pour éviter le CLS.
                    [t.cdDays, t.cdHours, t.cdMinutes, t.cdSeconds].map(
                      (label) => (
                        <span
                          key={label}
                          className="flex min-w-[46px] flex-col items-center rounded-lg border border-white/10 bg-white/5 px-2 py-1"
                          aria-hidden
                        >
                          <span className="text-lg font-extrabold leading-none tabular-nums text-white/30">
                            ––
                          </span>
                          <span className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-gray-400">
                            {label}
                          </span>
                        </span>
                      )
                    )}
              </span>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
