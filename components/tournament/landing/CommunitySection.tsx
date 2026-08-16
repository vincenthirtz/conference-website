// components/tournament/landing/CommunitySection.tsx
//
// Communauté : carte Discord dominante + grille de réseaux réels (miroir de
// FloatingSocials / Footer). Aucune donnée dynamique — liens fixes vérifiés.

import type { JSX } from 'react';
import { useT } from '@/lib/i18n/useT';
import { Section, SectionHeader, Reveal, GlassCard } from './primitives';
import { COMMUNITY_LINKS } from './types';
import nsTournamentLanding from '@/lib/i18n/locales/fr/tournamentLanding';

type Social = { name: string; href: string; Glyph: () => JSX.Element };

export default function CommunitySection() {
  const t = useT(nsTournamentLanding);

  const socials: Social[] = [
    { name: 'Twitch', href: COMMUNITY_LINKS.twitch, Glyph: TwitchG },
    { name: 'YouTube', href: COMMUNITY_LINKS.youtube, Glyph: YouTubeG },
    { name: 'Instagram', href: COMMUNITY_LINKS.instagram, Glyph: InstaG },
    { name: 'TikTok', href: COMMUNITY_LINKS.tiktok, Glyph: TikTokG },
  ];

  return (
    <Section id="community">
      <SectionHeader
        eyebrow={t.communityEyebrow}
        title={t.communityHeading}
        subtitle={t.communitySubtitle}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* Discord */}
        <Reveal>
          <GlassCard className="tl-gradient-border h-full">
            <div className="flex h-full flex-col justify-between gap-6 p-7">
              <div className="flex items-start gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#5865F2]/20 text-[#8b95f7]">
                  <DiscordG />
                </span>
                <div>
                  <h3 className="text-xl font-bold text-white">
                    {t.communityDiscordTitle}
                  </h3>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-400">
                    {t.communityDiscordText}
                  </p>
                </div>
              </div>
              <a
                href={COMMUNITY_LINKS.discord}
                target="_blank"
                rel="noreferrer"
              >
                <span className="tl-cta-glow inline-flex items-center gap-2 rounded-full bg-[#5865F2] px-6 py-3 text-sm font-bold text-white transition-transform hover:scale-[1.03]">
                  {t.communityDiscordCta}
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

        {/* Réseaux */}
        <Reveal>
          <GlassCard className="h-full">
            <div className="flex h-full flex-col p-7">
              <h3 className="text-base font-bold text-white">
                {t.communityFollowTitle}
              </h3>
              <p className="mt-2 text-sm text-gray-400">
                {t.communityFollowText}
              </p>
              <div className="mt-5 grid flex-1 grid-cols-2 gap-3">
                {socials.map((s) => (
                  <a
                    key={s.name}
                    href={s.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={s.name}
                    className="group flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 transition-all hover:-translate-y-0.5 hover:bg-white/[0.07]"
                  >
                    <span
                      className="text-gray-400 transition-colors"
                      style={{ color: undefined }}
                    >
                      <s.Glyph />
                    </span>
                    <span className="text-[13px] font-semibold text-gray-200 group-hover:text-white">
                      {s.name}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </GlassCard>
        </Reveal>
      </div>
    </Section>
  );
}

/* ── glyphes de marque (inline) ── */
function DiscordG() {
  return (
    <svg
      className="h-7 w-7"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M20 4.4A19.8 19.8 0 0 0 15 3l-.2.4a13 13 0 0 1 3 1.5 18 18 0 0 0-11.6 0 13 13 0 0 1 3-1.5L9 3a19.8 19.8 0 0 0-5 1.4C1.6 8 1 11.5 1.2 15a20 20 0 0 0 6 3l.4-.6a13 13 0 0 1-2-1l.5-.4a14 14 0 0 0 11.8 0l.5.4a13 13 0 0 1-2 1l.4.6a20 20 0 0 0 6-3c.3-4-.4-7.5-2.7-10.6zM8.7 13.3c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2z" />
    </svg>
  );
}
function TwitchG() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M4 2 3 6v13h4v3h3l3-3h4l5-5V2H4zm16 10-3 3h-4l-3 3v-3H6V4h14v8z" />
    </svg>
  );
}
function YouTubeG() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M23 12s0-3.8-.5-5.6a2.9 2.9 0 0 0-2-2C18.7 4 12 4 12 4s-6.7 0-8.5.4a2.9 2.9 0 0 0-2 2C1 8.2 1 12 1 12s0 3.8.5 5.6a2.9 2.9 0 0 0 2 2C5.3 20 12 20 12 20s6.7 0 8.5-.4a2.9 2.9 0 0 0 2-2C23 15.8 23 12 23 12zM10 15V9l5 3-5 3z" />
    </svg>
  );
}
function InstaG() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2c2.7 0 3 0 4.1.1 1 0 1.7.2 2.3.5.6.2 1.1.5 1.6 1s.8 1 1 1.6c.3.6.5 1.3.5 2.3C21.6 8.7 21.6 9 21.6 12s0 3.3-.1 4.4c0 1-.2 1.7-.5 2.3-.2.6-.5 1.1-1 1.6s-1 .8-1.6 1c-.6.3-1.3.5-2.3.5-1.1.1-1.4.1-4.1.1s-3 0-4.1-.1c-1 0-1.7-.2-2.3-.5a4.3 4.3 0 0 1-1.6-1c-.5-.5-.8-1-1-1.6-.3-.6-.5-1.3-.5-2.3C2.4 15.3 2.4 15 2.4 12s0-3.3.1-4.4c0-1 .2-1.7.5-2.3.2-.6.5-1.1 1-1.6s1-.8 1.6-1c.6-.3 1.3-.5 2.3-.5C9 2 9.3 2 12 2zm0 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4zM17.8 7a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0z" />
    </svg>
  );
}
function TikTokG() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M16.5 3c.3 2.1 1.5 3.6 3.5 3.8v2.4c-1.2.1-2.3-.3-3.5-.9v6.1c0 3.4-2.5 5.6-5.6 5.6A5.4 5.4 0 0 1 5.5 14c0-3 2.4-5.4 5.5-5.3v2.5c-.3 0-.6-.1-.9-.1a2.9 2.9 0 0 0 0 5.8c1.6 0 2.9-1.2 2.9-3V3h3.5z" />
    </svg>
  );
}
