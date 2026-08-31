/* eslint-disable @next/next/no-img-element */
// components/Home/HomeTeamsStrip.tsx
//
// La bande des équipes engagées, sur la page d'accueil.
//
// PARTI PRIS GRAPHIQUE — ce que ce n'est PAS, et pourquoi :
//
//   - Pas un défilement automatique. C'est la forme réflexe pour un bandeau de
//     logos, et c'est justement la mauvaise ici : ces logos sont faits pour
//     être CLIQUÉS. Une cible qui bouge se rate, et « pause au survol » ne
//     répare rien sur mobile, où il n'y a pas de survol. Le mouvement aurait
//     été joli sur une maquette et pénible à l'usage.
//
//   - Pas une grille de logos nus. Les logos fournis sont hétérogènes — photos
//     JPEG, SVG blancs, PNG détourés — et alignés bruts ils donnent une ligne
//     bancale, chacun avec sa densité et son fond. D'où le MÉDAILLON : un
//     disque identique pour toutes, qui rend la ligne régulière quel que soit
//     ce qu'on y verse.
//
// Ce que c'est : une rangée de médaillons circulaires, cerclés d'un anneau
// dégradé aux couleurs de la marque qui ne s'allume qu'au survol ou au focus.
// Au repos la bande est calme et lisible ; l'attention se pose sur une équipe
// à la fois.
//
// Deux détails qui font la différence entre « propre » et « pro » :
//
//   1. UNE ÉQUIPE SANS LOGO N'EST PAS UN TROU. Elle reçoit un monogramme
//      (short_name, à défaut ses initiales) sur le dégradé maison. La ligne
//      reste régulière — aujourd'hui Team Positivité n'a pas de logo, et ça ne
//      doit pas se lire comme un oubli.
//   2. Le défilement horizontal mobile est masqué en fondu sur les bords
//      (`mask-image`), pour que la coupure dise « ça continue » au lieu de
//      donner une bande tranchée net.

import type { JSX } from 'react';
import Link from 'next/link';
import { type HomeTeam } from '@/utils/home/loadHomeData';
import { useT, format } from '@/lib/i18n/useT';
import nsHomeV2 from '@/lib/i18n/locales/fr/homeV2';

/** Monogramme de repli : le nom court, sinon les initiales du nom. */
export function teamMonogram(
  team: Pick<HomeTeam, 'name' | 'shortName'>
): string {
  const short = (team.shortName ?? '').trim();
  if (short) return short.slice(0, 4).toUpperCase();
  const initials = team.name
    .trim()
    .split(/[\s'’-]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('');
  return (initials || team.name.slice(0, 2)).slice(0, 3).toUpperCase();
}

/** Lien vers la fiche d'équipe. Le slug prime, l'id est le repli. */
export function teamHref(team: HomeTeam): string {
  return `/team/${encodeURIComponent(team.slug || team.id)}`;
}

function TeamMedallion({ team }: { team: HomeTeam }): JSX.Element {
  return (
    <Link
      href={teamHref(team)}
      // Le nom de l'équipe est DANS le lien : pas d'aria-label à ajouter, il
      // ferait doublon avec le texte visible.
      className="group flex w-24 shrink-0 snap-center flex-col items-center gap-2 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)] sm:w-28"
      title={team.name}
    >
      <span
        className="relative flex h-20 w-20 items-center justify-center rounded-full p-[2px] transition-transform duration-300 group-hover:-translate-y-1 group-focus-visible:-translate-y-1 motion-reduce:transform-none sm:h-24 sm:w-24"
        aria-hidden="true"
      >
        {/* L'anneau dégradé : invisible au repos, il s'allume au survol et au
            focus clavier. Deux couches plutôt qu'une bordure, parce qu'une
            bordure en dégradé n'existe pas en CSS. */}
        <span className="absolute inset-0 rounded-full bg-white/10 transition-colors duration-300 group-hover:bg-gradient-to-br group-hover:from-[var(--color-violet)] group-hover:to-[var(--color-green)] group-focus-visible:bg-gradient-to-br group-focus-visible:from-[var(--color-violet)] group-focus-visible:to-[var(--color-green)]" />
        <span className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[var(--bg-base)] ring-1 ring-inset ring-white/10">
          {team.logoUrl ? (
            <img
              src={team.logoUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="bg-gradient-to-br from-[var(--color-violet-light)] to-[var(--color-green-light)] bg-clip-text text-lg font-extrabold tracking-tight text-transparent">
              {teamMonogram(team)}
            </span>
          )}
        </span>
      </span>
      <span className="line-clamp-2 text-center text-[11px] font-semibold uppercase leading-tight tracking-wide text-gray-400 transition-colors duration-300 group-hover:text-white group-focus-visible:text-white">
        {team.name}
      </span>
    </Link>
  );
}

export default function HomeTeamsStrip({
  teams,
}: {
  teams: HomeTeam[];
}): JSX.Element | null {
  const t = useT(nsHomeV2);

  // Aucune équipe engagée : pas de bande. Un bandeau vide sous le titre
  // « elles participent » poserait la question qu'il prétend résoudre.
  if (!teams.length) return null;

  return (
    <section className="container mx-auto mt-16 px-4 md:mt-20 md:px-0">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent py-8">
        {/* Filet dégradé en tête de carte : la signature de marque, en une
            ligne de 2px plutôt qu'un aplat qui écraserait les logos. */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[var(--color-violet)] to-transparent"
        />

        <div className="mb-6 flex flex-col items-center gap-1 px-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
            {format(t.teamsStripEyebrow, { count: teams.length })}
          </p>
          <h2 className="text-balance text-xl font-extrabold tracking-tight text-white md:text-2xl">
            {t.teamsStripTitle}
          </h2>
        </div>

        {/* Défilement horizontal sous le seuil où tout tient : le fondu des
            bords dit que la ligne continue. `snap` pour que le doigt s'arrête
            sur une équipe et non entre deux. */}
        <div className="[mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]">
          <ul className="flex snap-x snap-mandatory list-none justify-start gap-4 overflow-x-auto px-6 pb-2 sm:gap-6 lg:flex-wrap lg:justify-center lg:overflow-visible">
            {teams.map((team) => (
              <li key={team.id}>
                <TeamMedallion team={team} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
