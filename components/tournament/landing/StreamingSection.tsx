/* eslint-disable @next/next/no-img-element */
// components/tournament/landing/StreamingSection.tsx
//
// Diffusion : CTA « Regarder en direct » + casting (cast_members). Masquée
// entièrement si aucun casteur actif (« structure prête, vide si absent »).

import { useT } from '@/lib/i18n/useT';
import { Section, SectionHeader, Reveal, GlassCard } from './primitives';
import { COMMUNITY_LINKS } from './types';
import type { LandingCaster, TournamentPhase } from './types';
import nsTournamentLanding from '@/lib/i18n/locales/fr/tournamentLanding';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function StreamingSection({
  casters,
  phase,
}: {
  casters: LandingCaster[];
  phase: TournamentPhase;
}) {
  const t = useT(nsTournamentLanding);
  if (casters.length === 0) return null;

  const isLive = phase === 'live';

  return (
    <Section id="streaming">
      <SectionHeader
        eyebrow={t.streamEyebrow}
        title={t.streamHeading}
        subtitle={t.streamSubtitle}
      />

      {/* Bandeau watch-live */}
      <Reveal>
        <GlassCard className="mb-10 tl-gradient-border">
          <div className="flex flex-col items-center gap-5 p-7 text-center sm:flex-row sm:justify-between sm:text-left">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#9146FF]/20 text-[#b388ff]">
                <TwitchGlyph />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold text-white">Twitch</p>
                  {isLive && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-300">
                      <span className="tl-live-dot h-1.5 w-1.5 rounded-full bg-red-400" />
                      {t.streamStatusLive}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400">womens_cup</p>
              </div>
            </div>
            <a href={COMMUNITY_LINKS.twitch} target="_blank" rel="noreferrer">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#9146FF] px-6 py-3 text-sm font-bold text-white transition-transform hover:scale-[1.03]">
                {t.streamCtaTwitch}
                <svg
                  className="h-4 w-4"
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
            </a>
          </div>
        </GlassCard>
      </Reveal>

      {/* Casting */}
      <p className="mb-5 text-center text-xs font-semibold uppercase tracking-widest text-gray-500">
        {t.streamCastersHeading}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {casters.map((c, i) => {
          const inner = (
            <div className="group flex h-full flex-col items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.03] px-3 py-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-[#9146FF]/50">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5">
                {c.image_url ? (
                  <img
                    src={c.image_url}
                    alt={c.name}
                    width={64}
                    height={64}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                  />
                ) : (
                  <span className="text-sm font-bold text-gray-400">
                    {initials(c.name)}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold text-white">
                  {c.name}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-gray-500">
                  {c.title || t.streamCasterRole}
                </p>
              </div>
            </div>
          );
          return (
            <Reveal key={c.id} stagger={((i % 5) + 1) as 1 | 2 | 3 | 4 | 5}>
              {c.twitch_url ? (
                <a
                  href={c.twitch_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block h-full"
                >
                  {inner}
                </a>
              ) : (
                inner
              )}
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}

function TwitchGlyph() {
  return (
    <svg
      className="h-7 w-7"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M4 2 3 6v13h4v3h3l3-3h4l5-5V2H4zm16 10-3 3h-4l-3 3v-3H6V4h14v8z" />
      <path d="M13 7h2v5h-2zM17 7h2v5h-2z" />
    </svg>
  );
}
