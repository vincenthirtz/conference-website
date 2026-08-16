/* eslint-disable @next/next/no-img-element */
// components/tournament/landing/TeamRoster.tsx
//
// Roster premium des équipes engagées. Cartes avec logo, hover animé et lien
// vers la fiche équipe. Masquée entièrement si aucune équipe n'est publiée
// (« structure prête, vide si absent »).

import Link from 'next/link';
import { useT } from '@/lib/i18n/useT';
import { Section, SectionHeader, Reveal } from './primitives';
import type { LandingTeam } from './types';
import nsTournamentLanding from '@/lib/i18n/locales/fr/tournamentLanding';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function TeamRoster({
  teams,
  totalTeams,
  tournamentPath,
}: {
  teams: LandingTeam[];
  totalTeams: number;
  tournamentPath: string;
}) {
  const t = useT(nsTournamentLanding);
  if (totalTeams === 0) return null;

  const shown = teams.slice(0, 11);
  const remaining = totalTeams - shown.length;

  return (
    <Section id="teams">
      <SectionHeader
        eyebrow={t.teamsEyebrow}
        title={t.teamsHeading}
        subtitle={t.teamsSubtitle}
        align="left"
        action={
          <Link href={`${tournamentPath}/teams`}>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-gray-200 transition-colors hover:border-[var(--color-green)]/50 hover:text-white">
              {t.teamsViewAll}
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </span>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {shown.map((team, i) => (
          <Reveal key={team.id} stagger={((i % 5) + 1) as 1 | 2 | 3 | 4 | 5}>
            <Link href={`/team/${encodeURIComponent(team.slug || team.id)}`}>
              <div className="group flex h-full flex-col items-center gap-3 rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent px-3 py-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-[var(--color-green)]/50 hover:shadow-[0_10px_40px_-10px_rgba(123,201,106,0.3)]">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition-colors group-hover:border-[var(--color-green)]/40">
                  {team.logo_url ? (
                    <img
                      src={team.logo_url}
                      alt={team.name}
                      width={64}
                      height={64}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                    />
                  ) : (
                    <span className="text-sm font-bold text-gray-400 transition-colors group-hover:text-[var(--color-green-light)]">
                      {initials(team.short_name || team.name)}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-white">
                    {team.short_name || team.name}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-gray-500">
                    {team.name}
                  </p>
                </div>
                <span className="mt-auto text-[10px] font-semibold uppercase tracking-wider text-transparent transition-colors group-hover:text-[var(--color-green-light)]">
                  {t.teamCta}
                </span>
              </div>
            </Link>
          </Reveal>
        ))}

        {remaining > 0 && (
          <Link href={`${tournamentPath}/teams`}>
            <div className="flex h-full min-h-[9rem] flex-col items-center justify-center gap-1 rounded-3xl border border-dashed border-white/15 bg-white/[0.02] px-3 text-center transition-colors hover:border-[var(--color-violet)]/50 hover:bg-[var(--color-violet)]/5">
              <span className="text-2xl font-black text-[var(--color-violet-light)]">
                +{remaining}
              </span>
              <span className="text-[11px] font-medium text-gray-400">
                {t.teamsViewAll}
              </span>
            </div>
          </Link>
        )}
      </div>
    </Section>
  );
}
