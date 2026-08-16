// components/tournament/landing/TournamentCountdown.tsx
//
// Compte à rebours géant vers le coup d'envoi du tournoi. Purement client
// (tick 1 s). Rendu déterministe au premier paint (évite le mismatch
// d'hydratation) : on n'affiche les chiffres qu'après montage.

import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import type { TournamentPhase } from './types';
import nsTournamentLanding from '@/lib/i18n/locales/fr/tournamentLanding';

type Parts = { days: number; hours: number; minutes: number; seconds: number };

function diff(target: number, now: number): Parts | null {
  const ms = target - now;
  if (ms <= 0) return null;
  return {
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor(ms / 3_600_000) % 24,
    minutes: Math.floor(ms / 60_000) % 60,
    seconds: Math.floor(ms / 1000) % 60,
  };
}

const pad = (n: number) => n.toString().padStart(2, '0');

export default function TournamentCountdown({
  targetDate,
  phase,
  size = 'giant',
}: {
  targetDate?: string | null;
  phase: TournamentPhase;
  size?: 'giant' | 'compact';
}) {
  const t = useT(nsTournamentLanding);
  const targetMs = targetDate ? new Date(targetDate).getTime() : NaN;
  const [parts, setParts] = useState<Parts | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!isFinite(targetMs)) return;
    setMounted(true);
    const update = () => setParts(diff(targetMs, Date.now()));
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [targetMs]);

  // Rien à afficher si pas de date, ou tournoi déjà terminé/annulé.
  if (!isFinite(targetMs) || phase === 'finished' || phase === 'cancelled') {
    return null;
  }

  const label =
    phase === 'live' || (mounted && parts === null)
      ? t.countdownLabelLive
      : t.countdownLabelUpcoming;

  const units: { value: number; label: string }[] = parts
    ? [
        { value: parts.days, label: t.countdownDays },
        { value: parts.hours, label: t.countdownHours },
        { value: parts.minutes, label: t.countdownMinutes },
        { value: parts.seconds, label: t.countdownSeconds },
      ]
    : [];

  const isGiant = size === 'giant';
  const numCls = isGiant
    ? 'text-4xl sm:text-5xl md:text-6xl'
    : 'text-2xl sm:text-3xl';

  return (
    <div className={isGiant ? 'w-full' : ''}>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-green-light)]">
        {label}
      </p>

      {/* Réserve la hauteur avant hydratation pour éviter le layout shift. */}
      {!mounted || !parts ? (
        <div
          aria-hidden="true"
          className={`grid grid-cols-4 gap-2 sm:gap-3 ${isGiant ? 'max-w-md' : 'max-w-xs'}`}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-white/10 bg-white/[0.04] py-4"
            >
              <div className={`${numCls} font-extrabold text-transparent`}>
                00
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          className={`grid grid-cols-4 gap-2 sm:gap-3 ${isGiant ? 'max-w-md' : 'max-w-xs'}`}
          role="timer"
          aria-live="off"
        >
          {units.map((u, i) => (
            <div
              key={u.label}
              className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02] px-1 py-3 text-center backdrop-blur-sm sm:py-4"
            >
              <div
                className={`${numCls} font-extrabold leading-none tracking-tight tabular-nums text-white`}
              >
                {i === 0 ? u.value : pad(u.value)}
              </div>
              <div className="mt-1.5 text-[9px] font-medium uppercase tracking-widest text-gray-400 sm:text-[10px]">
                {u.label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
