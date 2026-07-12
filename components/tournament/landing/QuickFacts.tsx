// components/tournament/landing/QuickFacts.tsx
//
// Bande de « quick facts » sous le hero : 6 cartes compactes qui répondent en
// un coup d'œil aux questions clés (quand, quel jeu, où, combien d'équipes,
// quel format, où regarder).

import { useT } from '@/lib/i18n/useT';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { formatDateRange } from '@/utils/tournamentDates';
import { Reveal } from './primitives';
import type { LandingTournament } from './types';

type Fact = { icon: string; label: string; value: string };

export default function QuickFacts({
  tournament,
  totalTeams,
  maxTeams,
}: {
  tournament: LandingTournament;
  totalTeams: number;
  maxTeams: number | null;
}) {
  const t = useT('tournamentLanding');
  const { lang } = useLang();

  const dateRange = formatDateRange(
    tournament.start_date,
    tournament.end_date,
    lang
  );

  const teamsValue = maxTeams
    ? `${totalTeams}/${maxTeams}`
    : totalTeams > 0
      ? String(totalTeams)
      : t.factTbd;

  const facts: Fact[] = [
    { icon: '📅', label: t.factDate, value: dateRange || t.factTbd },
    { icon: '🎮', label: t.factGame, value: tournament.game || 'Overwatch' },
    { icon: '🌍', label: t.factRegion, value: t.factRegionValue },
    { icon: '👥', label: t.factTeams, value: teamsValue },
    { icon: '🏆', label: t.factFormat, value: tournament.format || t.factTbd },
    { icon: '📺', label: t.factStream, value: t.factStreamValue },
  ];

  return (
    <div className="relative z-[1] mx-auto -mt-6 w-full max-w-6xl px-4 sm:px-6 md:-mt-10">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {facts.map((f, i) => (
          <Reveal
            key={f.label}
            stagger={((i % 5) + 1) as 1 | 2 | 3 | 4 | 5}
            className="group rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md transition-colors hover:border-white/25 hover:bg-white/[0.07]"
          >
            <div className="text-xl">{f.icon}</div>
            <p className="mt-2 text-[9px] font-semibold uppercase tracking-widest text-gray-500">
              {f.label}
            </p>
            <p className="mt-0.5 truncate text-[13px] font-bold text-white" title={f.value}>
              {f.value}
            </p>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
