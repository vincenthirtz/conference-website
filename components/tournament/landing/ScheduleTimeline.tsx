// components/tournament/landing/ScheduleTimeline.tsx
//
// Timeline esport verticale : les grandes étapes de l'édition avec état
// (terminé / en cours / à venir) dérivé du statut du tournoi. Volontairement
// canonique (inscriptions → coup d'envoi → grande finale) pour rester honnête :
// on ne simule pas d'états par-phase qu'on ne connaît pas.

import { useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import { Section, SectionHeader } from './primitives';
import type { LandingTournament, TournamentPhase } from './types';
import nsTournamentLanding from '@/lib/i18n/locales/fr/tournamentLanding';

type StepState = 'done' | 'live' | 'upcoming' | 'closed';

function formatDay(
  iso: string | null | undefined,
  locale: string
): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const STATE_STYLES: Record<
  StepState,
  { dot: string; ring: string; badge: string }
> = {
  done: {
    dot: 'bg-[var(--color-green)]',
    ring: 'border-[var(--color-green)]/50',
    badge:
      'bg-[var(--color-green)]/15 text-[var(--color-green-light)] border-[var(--color-green)]/40',
  },
  live: {
    dot: 'bg-red-400 tl-live-dot',
    ring: 'border-red-500/50',
    badge: 'bg-red-500/15 text-red-300 border-red-500/40',
  },
  upcoming: {
    dot: 'bg-gray-600',
    ring: 'border-white/15',
    badge: 'bg-white/5 text-gray-400 border-white/15',
  },
  // Fermé n'est ni « à venir » ni « terminé » : c'est une porte close, et le
  // rouge le dit sans qu'on ait à lire le libellé.
  closed: {
    dot: 'bg-red-500',
    ring: 'border-red-500/50',
    badge: 'bg-red-500/15 text-red-300 border-red-500/40',
  },
};

export default function ScheduleTimeline({
  tournament,
  phase,
  registrationClosed = false,
}: {
  tournament: LandingTournament;
  phase: TournamentPhase;
  /** Plus une place libre : l'étape « inscriptions » n'est plus en cours. */
  registrationClosed?: boolean;
}) {
  const t = useT(nsTournamentLanding);
  const locale = useLocale();

  const stateFor = (step: 'registration' | 'kickoff' | 'final'): StepState => {
    if (phase === 'finished' || phase === 'cancelled') return 'done';
    if (phase === 'live') {
      if (step === 'final') return 'upcoming';
      if (step === 'kickoff') return 'live';
      return 'done';
    }
    // upcoming
    if (step !== 'registration') return 'upcoming';
    // Les inscriptions ne sont « en cours » que s'il reste des places.
    return registrationClosed ? 'closed' : 'live';
  };

  const badgeLabel = (s: StepState): string => {
    if (s === 'done') return t.scheduleStatusDone;
    if (s === 'closed') return t.scheduleStatusClosed;
    if (s === 'live') return t.scheduleStatusLive;
    return t.scheduleStatusUpcoming;
  };

  const steps: {
    key: 'registration' | 'kickoff' | 'final';
    title: string;
    text: string;
    date: string | null;
  }[] = [
    {
      key: 'registration',
      title: t.milestoneRegistration,
      text: t.milestoneRegistrationText,
      date: null,
    },
    {
      key: 'kickoff',
      title: t.milestoneKickoff,
      text: t.milestoneKickoffText,
      date: formatDay(tournament.start_date, locale),
    },
    {
      key: 'final',
      title: t.milestoneFinal,
      text: t.milestoneFinalText,
      date: formatDay(tournament.end_date, locale),
    },
  ];

  return (
    <Section id="schedule">
      <SectionHeader
        eyebrow={t.scheduleEyebrow}
        title={t.scheduleHeading}
        subtitle={t.scheduleSubtitle}
      />

      <ol className="relative mx-auto max-w-3xl">
        {/* Ligne verticale */}
        <div
          className="absolute left-[15px] top-2 bottom-2 w-px bg-gradient-to-b from-[var(--color-green)]/60 via-white/15 to-transparent"
          aria-hidden="true"
        />
        {steps.map((step) => {
          const s = stateFor(step.key);
          const style = STATE_STYLES[s];
          return (
            <li
              key={step.key}
              className="relative mb-6 flex gap-5 pl-1 last:mb-0"
            >
              <span
                className={`relative z-[1] mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-[#0d0520] ${style.ring}`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
              </span>
              <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-white">
                    {step.title}
                  </h3>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${style.badge}`}
                  >
                    {badgeLabel(s)}
                  </span>
                </div>
                {step.date && (
                  <p className="mt-1 text-[12px] font-medium text-[var(--color-violet-light)]">
                    {step.date}
                  </p>
                )}
                <p className="mt-2 text-sm leading-relaxed text-gray-400">
                  {step.text}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
