import { useEffect, useState, type JSX } from 'react';
import { useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';

type HomeCountdownProps = {
  /** ISO date string of the target event. If null/empty, the component renders nothing. */
  targetDate?: string | null;
  /** Short label shown above the countdown ("Coup d'envoi", "Inscriptions closes", etc.) */
  label?: string;
};

type Parts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

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

function CountdownSkeleton({
  targetMs,
  label,
}: {
  targetMs: number;
  label: string;
}) {
  const t = useT('homeCountdown');
  const locale = useLocale();
  return (
    <section
      className="container px-4 md:px-0 mt-12 md:mt-16"
      aria-label={t.ariaLabel}
    >
      <div className="neon-card p-6 md:p-8">
        <div className="flex flex-col items-center text-center gap-1 mb-5">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-violet-light)]">
            {label}
          </span>
          <span className="text-base md:text-lg text-gray-200">
            {new Date(targetMs).toLocaleString(locale, {
              dateStyle: 'long',
              timeStyle: 'short',
              timeZone: 'Europe/Paris',
            })}
          </span>
          <span className="brand-rule mt-2" aria-hidden />
        </div>
        <div
          className="grid grid-cols-4 gap-2 sm:gap-3 max-w-xl mx-auto"
          aria-hidden="true"
        >
          {[t.unitDays, t.unitHours, t.unitMinutes, t.unitSeconds].map(
            (cellLabel) => (
            <div
              key={cellLabel}
              className="countdown-cell flex flex-col items-center justify-center rounded-2xl border border-[var(--color-violet)]/25 bg-[var(--bg-elevated)]/60 py-3 sm:py-4"
            >
              <span className="text-2xl sm:text-4xl font-extrabold text-white/30 tabular-nums leading-none">
                ––
              </span>
              <span className="mt-1 text-[10px] sm:text-xs uppercase tracking-[0.18em] text-gray-400">
                {cellLabel}
              </span>
            </div>
            )
          )}
        </div>
      </div>
    </section>
  );
}

export default function HomeCountdown({
  targetDate,
  label,
}: HomeCountdownProps): JSX.Element | null {
  const t = useT('homeCountdown');
  const locale = useLocale();
  const effectiveLabel = label ?? t.kickoff;
  const targetMs = targetDate ? new Date(targetDate).getTime() : NaN;
  const isValid = Number.isFinite(targetMs);

  // Always start at null so SSR and the first client render agree;
  // the real countdown is computed in useEffect after mount.
  const [parts, setParts] = useState<Parts | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!isValid) return undefined;
    setMounted(true);
    const tick = () => setParts(diffParts(targetMs, Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isValid, targetMs]);

  if (!isValid) return null;
  // Reserve the visual slot during SSR / pre-hydration to avoid CLS.
  if (!mounted || !parts)
    return <CountdownSkeleton targetMs={targetMs} label={effectiveLabel} />;

  const cells: { value: number; label: string }[] = [
    { value: parts.days, label: parts.days > 1 ? t.unitDays : t.unitDay },
    { value: parts.hours, label: t.unitHours },
    { value: parts.minutes, label: t.unitMinutes },
    { value: parts.seconds, label: t.unitSeconds },
  ];

  return (
    <section
      className="container px-4 md:px-0 mt-12 md:mt-16"
      aria-label={t.ariaLabel}
    >
      <div className="neon-card p-6 md:p-8">
        <div className="flex flex-col items-center text-center gap-1 mb-5">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-violet-light)]">
            {effectiveLabel}
          </span>
          <span className="text-base md:text-lg text-gray-200">
            {new Date(targetMs).toLocaleString(locale, {
              dateStyle: 'long',
              timeStyle: 'short',
              timeZone: 'Europe/Paris',
            })}
          </span>
          <span className="brand-rule mt-2" aria-hidden />
        </div>
        <div className="grid grid-cols-4 gap-2 sm:gap-3 max-w-xl mx-auto">
          {cells.map(({ value, label: cellLabel }) => (
            <div
              key={cellLabel}
              className="countdown-cell flex flex-col items-center justify-center rounded-2xl border border-[var(--color-violet)]/25 bg-[var(--bg-elevated)]/60 py-3 sm:py-4"
            >
              <span className="countdown-digit text-2xl sm:text-4xl font-extrabold text-white tabular-nums leading-none">
                {pad(value)}
              </span>
              <span className="mt-1 text-[10px] sm:text-xs uppercase tracking-[0.18em] text-gray-400">
                {cellLabel}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
