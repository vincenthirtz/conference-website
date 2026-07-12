// components/tournament/landing/FormatInfographic.tsx
//
// Infographie du format : les phases du tournoi en cartes numérotées reliées
// par des flèches (compréhension en < 10 s). Dérivée des `stages`. Réutilise
// les libellés de type de phase du namespace `tournamentDetail`.

import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import { Section, SectionHeader, Reveal } from './primitives';
import type { LandingStage } from './types';

const STAGE_ICON: Record<string, string> = {
  group: '🎯',
  bracket: '🏆',
  swiss: '🔀',
  round_robin: '🔁',
  ffa: '⚔️',
  showmatch: '✨',
};

export default function FormatInfographic({
  stages,
  tournamentPath,
}: {
  stages: LandingStage[];
  tournamentPath: string;
}) {
  const t = useT('tournamentLanding');
  const td = useT('tournamentDetail');

  const stageTypeLabel = (type: string): string => {
    const map: Record<string, string> = {
      group: td.stageTypeGroup,
      bracket: td.stageTypeBracket,
      swiss: td.stageTypeSwiss,
      round_robin: td.stageTypeRoundRobin,
      showmatch: td.stageTypeShowmatch,
      other: td.stageTypeOther,
    };
    return map[type] || td.stageTypeOther;
  };

  return (
    <Section id="format">
      <SectionHeader
        eyebrow={t.formatEyebrow}
        title={t.formatHeading}
        subtitle={t.formatSubtitle}
      />

      {stages.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-10 text-center text-sm text-gray-400">
          {t.formatEmpty}
        </p>
      ) : (
        <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-stretch md:gap-2">
          {stages.map((s, i) => (
            <Reveal
              key={s.id}
              stagger={((i % 5) + 1) as 1 | 2 | 3 | 4 | 5}
              className="flex flex-1 items-stretch"
            >
              <div className="flex w-full flex-col rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent p-5 transition-colors hover:border-[var(--color-violet)]/40">
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{STAGE_ICON[s.stage_type] || '🎮'}</span>
                  <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    {t.formatStepLabel.replace('{n}', String(i + 1))}
                  </span>
                </div>
                <p className="mt-3 text-base font-bold text-white">{s.name}</p>
                <p className="mt-1 text-[12px] font-medium text-[var(--color-violet-light)]">
                  {stageTypeLabel(s.stage_type)}
                  {s.stage_type === 'swiss' && s.swiss_rounds
                    ? ` · ${t.formatSwissRounds.replace('{count}', String(s.swiss_rounds))}`
                    : ''}
                </p>
                {s.default_match_format && (
                  <p className="mt-2 text-[11px] text-gray-500">
                    {t.formatMatchLabel.replace('{format}', s.default_match_format)}
                  </p>
                )}
              </div>
              {i < stages.length - 1 && (
                <div
                  className="hidden items-center px-1 text-[var(--color-green)]/70 md:flex"
                  aria-hidden="true"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
              )}
            </Reveal>
          ))}
        </div>
      )}

      <div className="mt-8 flex justify-center">
        <Link href={`${tournamentPath}/bracket`}>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-[var(--color-violet)]/50 hover:bg-[var(--color-violet)]/10">
            {t.formatCta}
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </span>
        </Link>
      </div>
    </Section>
  );
}
