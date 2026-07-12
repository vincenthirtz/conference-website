// components/tournament/landing/BracketPreview.tsx
//
// Prévisualisation schématique de l'arbre. Architecture prête même quand les
// affiches ne sont pas connues (slots « À déterminer »). Winners / Losers /
// Grande finale selon que le tournoi a une phase double-élimination.

import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import { Section, SectionHeader, Reveal } from './primitives';
import type { LandingStage } from './types';

function BracketSlot() {
  const t = useT('tournamentLanding');
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
      <span className="h-5 w-5 shrink-0 rounded bg-white/8" aria-hidden="true" />
      <span className="truncate text-[11px] text-gray-500">{t.bracketTbd}</span>
    </div>
  );
}

function BracketMatch() {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-2">
      <BracketSlot />
      <BracketSlot />
    </div>
  );
}

function BracketColumn({
  label,
  count,
  stagger,
}: {
  label: string;
  count: number;
  stagger: 1 | 2 | 3 | 4 | 5;
}) {
  return (
    <Reveal stagger={stagger} className="flex min-w-[150px] flex-1 flex-col gap-3">
      <p className="text-center text-[10px] font-semibold uppercase tracking-widest text-gray-500">
        {label}
      </p>
      <div className="flex flex-1 flex-col justify-around gap-3">
        {Array.from({ length: count }).map((_, i) => (
          <BracketMatch key={i} />
        ))}
      </div>
    </Reveal>
  );
}

export default function BracketPreview({
  stages,
  tournamentPath,
}: {
  stages: LandingStage[];
  tournamentPath: string;
}) {
  const t = useT('tournamentLanding');

  const hasDoubleElim = stages.some(
    (s) =>
      s.bracket_format === 'double_elimination' ||
      s.bracket_format === 'double' ||
      /double/i.test(s.bracket_format || '')
  );

  return (
    <Section id="bracket">
      <SectionHeader
        eyebrow={t.bracketEyebrow}
        title={t.bracketHeading}
        subtitle={t.bracketSubtitle}
        align="left"
        action={
          <Link href={`${tournamentPath}/bracket`}>
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--color-violet)] px-5 py-2.5 text-xs font-bold text-white transition-transform hover:scale-[1.03]">
              {t.bracketCta}
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </span>
          </Link>
        }
      />

      <div className="overflow-x-auto">
        <div className="min-w-[640px] rounded-3xl border border-white/10 bg-white/[0.02] p-5 sm:p-7">
          {/* Winners */}
          <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--color-green-light)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-green)]" />
            {t.bracketWinners}
          </p>
          <div className="flex items-stretch gap-4">
            <BracketColumn label={t.bracketRound.replace('{n}', '1')} count={4} stagger={1} />
            <BracketColumn label={t.bracketRound.replace('{n}', '2')} count={2} stagger={2} />
            <BracketColumn label={t.bracketRound.replace('{n}', '3')} count={1} stagger={3} />
            <Reveal stagger={4} className="flex min-w-[150px] flex-1 flex-col justify-center gap-3">
              <p className="text-center text-[10px] font-semibold uppercase tracking-widest text-[var(--color-yellow)]">
                {t.bracketFinal}
              </p>
              <div className="tl-gradient-border rounded-xl">
                <div className="flex flex-col gap-1.5 rounded-xl bg-[#0d0520] p-2">
                  <BracketSlot />
                  <BracketSlot />
                </div>
              </div>
            </Reveal>
          </div>

          {/* Losers (double elim only) */}
          {hasDoubleElim && (
            <>
              <div className="my-6 h-px bg-white/8" />
              <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--color-violet-light)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-violet)]" />
                {t.bracketLosers}
              </p>
              <div className="flex items-stretch gap-4">
                <BracketColumn label={t.bracketRound.replace('{n}', '1')} count={3} stagger={1} />
                <BracketColumn label={t.bracketRound.replace('{n}', '2')} count={2} stagger={2} />
                <BracketColumn label={t.bracketRound.replace('{n}', '3')} count={1} stagger={3} />
              </div>
            </>
          )}
        </div>
      </div>
    </Section>
  );
}
