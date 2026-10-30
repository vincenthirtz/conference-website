// components/Home/HomeSpotlight.tsx
//
// « À SUIVRE » — les prochaines rencontres.
//
// CE QUI A ÉTÉ RETIRÉ, ET POURQUOI. La section portait la fiche du tournoi :
// nom, dates, format, places (8 / 8), barre de progression, « Voir le
// calendrier », « Voir le tournoi », plus un panneau Twitch à droite. Tout cela
// ne bouge pas d'un pouce pendant cinq semaines de saison, et le panneau
// annonçait surtout, 95 % du temps, que le direct n'avait pas commencé : le
// haut de la page d'accueil disait donc quelque chose d'immobile pendant que la
// compétition, elle, avançait. Le hero porte déjà l'état de la saison et les
// liens vers le classement et le calendrier.
//
// Reste ce qui change : les affiches des deux prochaines journées.
// Les clips du moment sont partis à leur tour (2026-10-23) : ils passaient
// AVANT les affiches, et un soir de finales c'est l'affiche qu'on vient voir.
// La bande des équipes engagées aussi (2026-10-30) : une fois la saison finie,
// elle annonçait encore les participantes de la dernière édition.
//
// LE SOIR DES FINALES, la carte les nomme (« Ce soir · Les finales »), se
// détache du reste et renvoie au direct — cf. `finalsTonight`.

import type { JSX } from 'react';
import { type UpcomingTournament } from '@/components/Home/HomeUpcomingTournament';
import HomeMatchdayStrip from '@/components/Home/HomeMatchdayStrip';
import { type HomeMatchday } from '@/utils/home/loadNextMatchday';
import { TwitchIcon } from '@/components/Icons';
import { socialUrl } from '@/config/socials';
import { useT } from '@/lib/i18n/useT';
import nsHomeV2 from '@/lib/i18n/locales/fr/homeV2';

type HomeSpotlightProps = {
  tournament: UpcomingTournament | null;
  /**
   * Les affiches des deux prochaines journées (« vendredi, X contre Y à
   * 20 h 30 », puis la suivante). Optionnel : la carte sait vivre sans.
   */
  matchdays?: HomeMatchday[];
  /**
   * La première journée se joue aujourd'hui et ne compte que des finales
   * (cf. `isFinalsDay`) : titre dédié, cadre en relief, lien vers le direct.
   */
  finalsTonight?: boolean;
};

const TWITCH_CHANNEL_URL = socialUrl('twitch');

export default function HomeSpotlight({
  tournament,
  matchdays = [],
  finalsTonight = false,
}: HomeSpotlightProps): JSX.Element | null {
  const t = useT(nsHomeV2);

  if (!tournament) return null;

  const detailHref = tournament.slug
    ? `/tournament/${tournament.slug}`
    : `/tournament/${tournament.id}`;
  const matchesHref = `${detailHref}/matches`;

  // Sans affiche, pas de carte vide.
  if (!matchdays[0]) return null;

  return (
    <section className="container mx-auto mt-16 px-4 md:mt-20 md:px-0">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p
            className={`text-xs font-semibold uppercase tracking-[0.18em] ${
              finalsTonight ? 'text-[var(--color-yellow)]' : 'text-gray-400'
            }`}
          >
            {finalsTonight ? t.spotFinalsEyebrow : t.spotEyebrow}
          </p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white md:text-3xl">
            {finalsTonight ? t.spotFinalsTitle : t.spotTitle}
          </h2>
        </div>
        {finalsTonight && (
          <a
            href={TWITCH_CHANNEL_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
          >
            {/* Le logo, pas une pastille « en direct » : le bouton est là
                    avant le coup d'envoi, et le hero dit déjà quand on y est. */}
            <span aria-hidden>
              <TwitchIcon className="h-4 w-4 text-[#a970ff]" />
            </span>
            {t.spotFinalsWatch}
          </a>
        )}
      </div>

      <div
        className={`card-brand overflow-hidden rounded-3xl border bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-base)] ${
          finalsTonight
            ? 'border-[var(--color-yellow)]/40 shadow-[0_0_48px_-16px_var(--color-yellow)]'
            : 'border-white/10'
        }`}
      >
        <HomeMatchdayStrip
          matchday={matchdays[0]}
          // « Et après ? » : la journée suivante, mêmes affiches. Sans
          // elle, il fallait ouvrir le calendrier pour savoir quand on
          // rejoue.
          following={matchdays[1] ?? null}
          matchesHref={matchesHref}
        />
      </div>
    </section>
  );
}
