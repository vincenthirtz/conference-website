// components/tournament/landing/StreamingSection.tsx
//
// Diffusion : CTA « Regarder en direct » + attribution du casting.
//
// Le casting n'est plus une grille de fiches `cast_members` : le vivier de
// caster·euses est fourni par POGTV, le studio qui produit la diffusion, et
// les noms sont annoncés au fil de l'eau. Tant qu'aucune annonce n'est faite,
// afficher d'anciennes fiches induirait en erreur — on montre donc le bandeau
// POGTV (source du vivier) + une mention « annonces à venir ».

import { useT } from '@/lib/i18n/useT';
import ProductionPartner from '@/components/Production/ProductionPartner';
import { Section, SectionHeader, Reveal, GlassCard } from './primitives';
import { COMMUNITY_LINKS } from './types';
import type { TournamentPhase } from './types';
import nsTournamentLanding from '@/lib/i18n/locales/fr/tournamentLanding';

export default function StreamingSection({
  phase,
}: {
  phase: TournamentPhase;
}) {
  const t = useT(nsTournamentLanding);

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

      {/* Casting — vivier POGTV, noms annoncés plus tard */}
      <p className="mb-5 text-center text-xs font-semibold uppercase tracking-widest text-gray-500">
        {t.streamCastersHeading}
      </p>
      <Reveal>
        <ProductionPartner variant="compact" />
        <p className="mt-4 flex flex-wrap items-center justify-center gap-2 text-center text-sm text-gray-400">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-gray-300">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-violet-light)]" />
            {t.streamCastSoonBadge}
          </span>
          <span>{t.streamCastSoonBody}</span>
        </p>
      </Reveal>
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
