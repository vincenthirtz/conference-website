// components/tournament/landing/TournamentStats.tsx
//
// Section statistiques : compteurs animés (montée à l'apparition). Ne montre
// que des chiffres réels dérivés des données du tournoi + deux cartes
// « identité » (100 % féminin, communauté Discord).

import { useT } from '@/lib/i18n/useT';
import { useReveal } from '@/hooks/useReveal';
import { useCountUp } from '@/hooks/useCountUp';
import { Section, SectionHeader, Spotlight } from './primitives';
import nsTournamentLanding from '@/lib/i18n/locales/fr/tournamentLanding';

type NumericStat = {
  kind: 'number';
  value: number;
  label: string;
  accent: 'violet' | 'green' | 'yellow';
};
type TextStat = {
  kind: 'text';
  value: string;
  label: string;
  accent: 'violet' | 'green' | 'yellow';
};
type Stat = NumericStat | TextStat;

const ACCENT: Record<'violet' | 'green' | 'yellow', string> = {
  violet: 'text-[var(--color-violet-light)]',
  green: 'text-[var(--color-green-light)]',
  yellow: 'text-[var(--color-yellow)]',
};

function StatCard({ stat }: { stat: Stat }) {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  const counted = useCountUp(stat.kind === 'number' ? stat.value : 0, revealed);
  const display = stat.kind === 'number' ? counted : stat.value;
  return (
    <div
      ref={ref}
      data-revealed={revealed}
      className="tl-reveal relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-center backdrop-blur-sm transition-colors hover:border-white/20 sm:p-8"
    >
      <div
        className={`text-4xl font-black tracking-tight tabular-nums sm:text-5xl ${ACCENT[stat.accent]}`}
      >
        {display}
      </div>
      <p className="mt-2 text-xs font-medium uppercase tracking-widest text-gray-400">
        {stat.label}
      </p>
    </div>
  );
}

export default function TournamentStats({
  totalTeams,
  placesRemaining,
  totalMatches,
  stagesCount,
}: {
  totalTeams: number;
  placesRemaining: number | null;
  totalMatches: number;
  stagesCount: number;
}) {
  const t = useT(nsTournamentLanding);

  const stats: Stat[] = [
    {
      kind: 'number',
      value: totalTeams,
      label: t.statTeamsLabel,
      accent: 'violet',
    },
    {
      kind: 'number',
      value:
        placesRemaining !== null && placesRemaining > 0 ? placesRemaining : 0,
      label: t.statSlotsLabel,
      accent: 'green',
    },
    {
      kind: 'number',
      value: totalMatches,
      label: t.statMatchesLabel,
      accent: 'yellow',
    },
    {
      kind: 'number',
      value: stagesCount,
      label: t.statStagesLabel,
      accent: 'violet',
    },
    {
      kind: 'text',
      value: t.statFemaleValue,
      label: t.statFemaleLabel,
      accent: 'green',
    },
    {
      kind: 'text',
      value: t.statCommunityValue,
      label: t.statCommunityLabel,
      accent: 'yellow',
    },
  ];

  return (
    <Section id="stats">
      <Spotlight
        color="violet"
        className="left-1/2 top-0 h-[380px] w-[600px] -translate-x-1/2 opacity-60"
      />
      <SectionHeader
        eyebrow={t.statsEyebrow}
        title={t.statsHeading}
        subtitle={t.statsSubtitle}
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {stats.map((s) => (
          <StatCard key={s.label} stat={s} />
        ))}
      </div>
    </Section>
  );
}
