// components/tournament/landing/PrizeTeaser.tsx
//
// Section « Récompenses » — aucun montant en base : on n'invente rien. Podium
// à trois marches avec lots « À venir » + teaser « annoncées prochainement ».

import { useT } from '@/lib/i18n/useT';
import { Section, SectionHeader, Reveal } from './primitives';

export default function PrizeTeaser() {
  const t = useT('tournamentLanding');

  const podium: { place: string; emoji: string; height: string; accent: string; order: number }[] = [
    { place: t.prizeSecond, emoji: '🥈', height: 'h-24', accent: 'from-gray-300/20', order: 1 },
    { place: t.prizeFirst, emoji: '🥇', height: 'h-32', accent: 'from-[var(--color-yellow)]/25', order: 2 },
    { place: t.prizeThird, emoji: '🥉', height: 'h-20', accent: 'from-amber-600/20', order: 3 },
  ];

  return (
    <Section id="prize">
      <Spotlightlike />
      <SectionHeader
        eyebrow={t.prizeEyebrow}
        title={t.prizeHeading}
        subtitle={t.prizeSubtitle}
      />

      <div className="mx-auto flex max-w-2xl items-end justify-center gap-3 sm:gap-5">
        {podium
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((p, i) => (
            <Reveal
              key={p.place}
              stagger={((i % 5) + 1) as 1 | 2 | 3 | 4 | 5}
              className="flex flex-1 flex-col items-center"
            >
              <span className="mb-3 text-3xl sm:text-4xl">{p.emoji}</span>
              <div
                className={`flex ${p.height} w-full flex-col items-center justify-start rounded-t-2xl border border-white/10 border-b-0 bg-gradient-to-b ${p.accent} to-transparent pt-3`}
              >
                <span className="text-[11px] font-bold uppercase tracking-wider text-white">
                  {p.place}
                </span>
                <span className="mt-1 text-[10px] text-gray-500">{t.prizeTbd}</span>
              </div>
            </Reveal>
          ))}
      </div>

      <Reveal className="mx-auto mt-8 max-w-xl rounded-2xl border border-[var(--color-yellow)]/25 bg-gradient-to-r from-[var(--color-yellow)]/8 to-transparent p-5 text-center">
        <p className="text-sm font-bold text-[var(--color-yellow)]">
          {t.prizeComingSoon}
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-gray-400">
          {t.prizeComingText}
        </p>
      </Reveal>
    </Section>
  );
}

// Petite aura locale (évite un import circulaire de Spotlight avec style inline).
function Spotlightlike() {
  return (
    <div
      aria-hidden="true"
      className="tl-spotlight left-1/2 top-10 h-[300px] w-[500px] -translate-x-1/2"
      style={{ background: 'rgba(240,230,60,0.10)' }}
    />
  );
}
