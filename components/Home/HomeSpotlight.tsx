// components/Home/HomeSpotlight.tsx
//
// « À SUIVRE » — ce que la chaîne vient de produire, puis les prochaines
// rencontres. Et dessous, sur toute la largeur, les équipes engagées.
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
// Reste ce qui change : les clips du moment, les affiches des deux prochaines
// journées, les blasons.
//
// LES ÉQUIPES SONT HORS DE LA CARTE. Elles en occupaient le pied en REPLI du
// calendrier : les semaines où une journée est publiée, elles disparaissaient
// purement et simplement. Or « qui court » et « qui joue vendredi » ne sont pas
// deux réponses à la même question.

import type { JSX } from 'react';
import { type UpcomingTournament } from '@/components/Home/HomeUpcomingTournament';
import HomeTeamsStrip from '@/components/Home/HomeTeamsStrip';
import HomeMatchdayStrip from '@/components/Home/HomeMatchdayStrip';
import HomeClips from '@/components/Home/HomeClips';
import { type HomeTeam, type HomeClip } from '@/utils/home/loadHomeData';
import { type HomeMatchday } from '@/utils/home/loadNextMatchday';
import { socialUrl } from '@/config/socials';
import { useT } from '@/lib/i18n/useT';
import nsHomeV2 from '@/lib/i18n/locales/fr/homeV2';

type HomeSpotlightProps = {
  tournament: UpcomingTournament | null;
  /** Équipes engagées, rendues en bande pleine largeur sous la carte. */
  teams: HomeTeam[];
  /**
   * Les affiches des deux prochaines journées (« vendredi, X contre Y à
   * 20 h 30 », puis la suivante). Optionnel : la carte sait vivre sans.
   */
  matchdays?: HomeMatchday[];
  /** Les clips du moment de la chaîne (vide = pas de bloc). */
  clips?: HomeClip[];
};

const TWITCH_CHANNEL_URL = socialUrl('twitch');

export default function HomeSpotlight({
  tournament,
  teams,
  matchdays = [],
  clips = [],
}: HomeSpotlightProps): JSX.Element | null {
  const t = useT(nsHomeV2);

  if (!tournament) return null;

  const detailHref = tournament.slug
    ? `/tournament/${tournament.slug}`
    : `/tournament/${tournament.id}`;
  const matchesHref = `${detailHref}/matches`;

  // Ni clip ni affiche : pas de carte vide. La bande des équipes, elle, existe
  // toujours.
  const hasCard = clips.length > 0 || Boolean(matchdays[0]);

  return (
    <>
      {hasCard && (
        <section className="container mx-auto mt-16 px-4 md:mt-20 md:px-0">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
              {t.spotEyebrow}
            </p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white md:text-3xl">
              {t.spotTitle}
            </h2>
          </div>

          <div className="card-brand overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-base)]">
            <HomeClips clips={clips} channelUrl={TWITCH_CHANNEL_URL} />

            {matchdays[0] && (
              <HomeMatchdayStrip
                matchday={matchdays[0]}
                // « Et après ? » : la journée suivante, mêmes affiches. Sans
                // elle, il fallait ouvrir le calendrier pour savoir quand on
                // rejoue.
                following={matchdays[1] ?? null}
                matchesHref={matchesHref}
              />
            )}
          </div>
        </section>
      )}

      {/* QUI COURT, sur toute la largeur de la page. Hors de la carte : le
        conteneur qui cadre le texte étranglait une bande dont le contenu est
        une suite de blasons — elle respire d'un bord à l'autre, et elle ne
        dépend plus de l'absence de calendrier pour exister. */}
      <HomeTeamsStrip teams={teams} />
    </>
  );
}
