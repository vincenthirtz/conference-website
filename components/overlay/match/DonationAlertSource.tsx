// components/overlay/match/DonationAlertSource.tsx
//
// La source « alerte don » : une carte « Merci pour ce don de 10 € ! » à chaque
// nouveau don HelloAsso, et une jauge d'objectif optionnelle — sur fond
// transparent, à poser à côté de Streamlabs (qui ne connaît pas HelloAsso).
//
// LE MONTANT, JAMAIS LE NOM. Le donateur a saisi son identité pour un reçu
// fiscal ; il n'a pas consenti à la voir à l'antenne. L'API ne la connaît
// d'ailleurs pas (cf. database/migrations/add_helloasso_donations.sql).
//
// La file (premier chargement « déjà vu », une alerte à la fois) vit dans
// `utils/overlay/donAlert.ts`, testée sans DOM. Ce composant ne fait que
// l'enchaîner dans le temps : apparition, `duration`, sortie, courte pause,
// alerte suivante. Seule animation de la source : l'entrée et la sortie de
// l'alerte, coupées quand le système demande moins de mouvement.

import { useEffect, useState } from 'react';
import { format, useT } from '@/lib/i18n/useT';
import nsOverlay from '@/lib/i18n/locales/fr/overlay';
import { stageStyle, useStageFit } from '@/hooks/useStageFit';
import {
  formatEuros,
  gaugeRatio,
  ingestDonations,
  initialQueueState,
  shiftQueue,
  type DonAlertDonation,
  type DonAlertFeed,
} from '@/utils/overlay/donAlert';

/** Durée de l'animation de sortie (retranchée de la durée d'affichage). */
const EXIT_MS = 600;
/** Respiration entre deux alertes, pour qu'elles ne se confondent pas. */
const GAP_MS = 800;

const SHADOW = {
  textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 4px 18px rgba(0,0,0,0.75)',
} as const;

export type DonationAlertFeed = DonAlertFeed & { totalCents: number };

export function DonationGauge({
  totalCents,
  goalCents,
  accent,
}: {
  totalCents: number;
  goalCents: number;
  accent: string;
}) {
  const t = useT(nsOverlay);
  const ratio = gaugeRatio(totalCents, goalCents);
  return (
    <div className="w-[1100px]" data-testid="don-gauge">
      <div
        className="mb-3 flex items-end justify-between gap-6 px-1"
        style={SHADOW}
      >
        <span
          className="text-2xl font-black uppercase tracking-[0.3em]"
          style={{ color: accent }}
        >
          {t.donAlertGaugeLabel}
        </span>
        <span className="text-4xl font-black tabular-nums text-white">
          {format(t.donAlertGaugeProgress, {
            total: formatEuros(totalCents),
            goal: formatEuros(goalCents),
          })}
        </span>
      </div>
      <div
        className="h-9 overflow-hidden rounded-full border-2 border-white/25 bg-black/60 shadow-2xl"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
      >
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${ratio * 100}%`, backgroundColor: accent }}
        />
      </div>
    </div>
  );
}

function AlertCard({
  donation,
  leaving,
  accent,
  logoSrc,
}: {
  donation: DonAlertDonation;
  leaving: boolean;
  accent: string;
  logoSrc: string | null;
}) {
  const t = useT(nsOverlay);
  const amount = formatEuros(donation.amountCents);
  return (
    <div
      className={`flex flex-col items-center gap-5 rounded-3xl border border-white/10 bg-black/70 px-20 py-12 shadow-2xl ${
        leaving ? 'don-alert-leave' : 'don-alert-enter'
      }`}
      style={{ borderColor: `${accent}66` }}
      data-testid="don-alert"
    >
      <span className="sr-only">{format(t.donAlertAnnounce, { amount })}</span>
      {logoSrc ? (
        // biome-ignore lint/performance/noImgElement: source OBS — pas de next/image
        <img src={logoSrc} alt="" className="h-24 w-auto drop-shadow-2xl" />
      ) : null}
      <span
        className="text-2xl font-black uppercase tracking-[0.35em]"
        style={{ ...SHADOW, color: accent }}
        aria-hidden="true"
      >
        {t.donAlertEyebrow}
      </span>
      <span
        className="text-[9rem] font-black leading-none tabular-nums text-white"
        style={SHADOW}
        aria-hidden="true"
      >
        {amount}
      </span>
      <span
        className="text-5xl font-black text-white"
        style={SHADOW}
        aria-hidden="true"
      >
        {t.donAlertThanks}
      </span>
    </div>
  );
}

export function DonationAlertSource({
  feed,
  accent,
  scale,
  durationMs,
  goalCents,
  gaugeOnly,
  logoSrc,
  demo = false,
}: {
  /** Dernière réponse (API, ou flux de démo), `null` avant le premier chargement. */
  feed: DonationAlertFeed | null;
  accent: string;
  scale: number;
  durationMs: number;
  goalCents: number | null;
  gaugeOnly: boolean;
  logoSrc: string | null;
  demo?: boolean;
}) {
  const t = useT(nsOverlay);
  const fit = useStageFit();
  const [queueState, setQueueState] = useState(initialQueueState);
  const [current, setCurrent] = useState<{
    donation: DonAlertDonation;
    leaving: boolean;
  } | null>(null);

  // Chaque réponse passe par la file : le premier chargement ne fait que
  // marquer « vu », les suivants ajoutent les nouveaux dons.
  useEffect(() => {
    if (!feed || gaugeOnly) return;
    setQueueState((s) => ingestDonations(s, feed));
  }, [feed, gaugeOnly]);

  // Rien à l'écran et un don en attente : il entre, après une respiration.
  useEffect(() => {
    if (current || queueState.queue.length === 0) return undefined;
    const next = queueState.queue[0];
    const timer = setTimeout(() => {
      if (!next) return;
      setQueueState((s) => shiftQueue(s).state);
      setCurrent({ donation: next, leaving: false });
    }, GAP_MS);
    return () => clearTimeout(timer);
  }, [current, queueState.queue]);

  // Durée d'affichage, puis sortie, puis place libre pour la suivante.
  useEffect(() => {
    if (!current) return undefined;
    const timer = current.leaving
      ? setTimeout(() => setCurrent(null), EXIT_MS)
      : setTimeout(
          () => setCurrent((c) => (c ? { ...c, leaving: true } : c)),
          Math.max(0, durationMs - EXIT_MS)
        );
    return () => clearTimeout(timer);
  }, [current, durationMs]);

  const zoom = scale !== 1 ? `scale(${scale})` : undefined;

  return (
    <div
      className="absolute left-1/2 top-1/2 origin-center"
      style={stageStyle(fit)}
    >
      <style jsx global>{`
        @keyframes don-alert-in {
          from {
            opacity: 0;
            transform: translateY(40px) scale(0.9);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        @keyframes don-alert-out {
          from {
            opacity: 1;
            transform: none;
          }
          to {
            opacity: 0;
            transform: translateY(-30px) scale(0.96);
          }
        }
        .don-alert-enter {
          animation: don-alert-in 500ms cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
        }
        .don-alert-leave {
          animation: don-alert-out ${EXIT_MS}ms ease-in both;
        }
        @media (prefers-reduced-motion: reduce) {
          .don-alert-enter,
          .don-alert-leave {
            animation: none;
          }
        }
      `}</style>

      {demo ? (
        <span className="absolute left-8 top-8 rounded-full bg-amber-400 px-4 py-1 text-lg font-black uppercase tracking-widest text-black">
          {t.donAlertDemoBadge}
        </span>
      ) : null}

      {!gaugeOnly ? (
        <div
          className="absolute inset-x-0 top-[12%] flex justify-center"
          role="status"
          aria-live="polite"
        >
          <div className="origin-top" style={{ transform: zoom }}>
            {current ? (
              <AlertCard
                key={current.donation.id}
                donation={current.donation}
                leaving={current.leaving}
                accent={accent}
                logoSrc={logoSrc}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {goalCents != null ? (
        <div
          className={`absolute inset-x-0 flex justify-center ${
            gaugeOnly ? 'top-1/2 -translate-y-1/2' : 'bottom-16'
          }`}
        >
          <div
            className={gaugeOnly ? 'origin-center' : 'origin-bottom'}
            style={{ transform: zoom }}
          >
            <DonationGauge
              totalCents={feed?.totalCents ?? 0}
              goalCents={goalCents}
              accent={accent}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
