import { useEffect, useState, type JSX } from 'react';

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

export default function HomeCountdown({
  targetDate,
  label = "Coup d'envoi",
}: HomeCountdownProps): JSX.Element | null {
  const targetMs = targetDate ? new Date(targetDate).getTime() : NaN;
  const isValid = Number.isFinite(targetMs);

  const [parts, setParts] = useState<Parts | null>(() =>
    isValid ? diffParts(targetMs, Date.now()) : null
  );

  useEffect(() => {
    if (!isValid) return undefined;
    const tick = () => setParts(diffParts(targetMs, Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isValid, targetMs]);

  if (!isValid || !parts) return null;

  const cells: { value: number; label: string }[] = [
    { value: parts.days, label: parts.days > 1 ? 'jours' : 'jour' },
    { value: parts.hours, label: 'h' },
    { value: parts.minutes, label: 'min' },
    { value: parts.seconds, label: 's' },
  ];

  return (
    <section
      className="container px-4 md:px-0 mt-12 md:mt-16"
      aria-label="Compte à rebours avant le tournoi"
    >
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-6 md:p-8 backdrop-blur-sm">
        <div className="flex flex-col items-center text-center gap-1 mb-5">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200/80">
            {label}
          </span>
          <span className="text-base md:text-lg text-gray-200">
            {new Date(targetMs).toLocaleString('fr-FR', {
              dateStyle: 'long',
              timeStyle: 'short',
            })}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:gap-3 max-w-xl mx-auto">
          {cells.map(({ value, label: cellLabel }) => (
            <div
              key={cellLabel}
              className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-[var(--bg-elevated)]/60 py-3 sm:py-4"
            >
              <span className="text-2xl sm:text-4xl font-extrabold text-white tabular-nums leading-none">
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
