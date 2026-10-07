// config/homeEventSpotlight.ts
//
// L'encart d'événement ponctuel de l'accueil (HomeEventSpotlight) — un
// tournoi hors saison qu'on veut pousser quelques semaines : logo, vidéo,
// lien vers sa fiche et bouton d'inscription.
//
// POURQUOI UN FICHIER ET PAS UN RÉGLAGE ADMIN. Un tel événement revient deux
// ou trois fois par an, et sa vidéo est fournie à la main : un formulaire
// d'administration coûterait plus cher que ces quelques lignes. L'encart se
// retire seul passé `visibleUntil` — inutile de penser à le désactiver.
//
// VIDÉOS. Hébergées sur YouTube (les fichiers sources font plus de 100 Mo,
// au-delà de ce que Git et Netlify acceptent). Renseigner l'ID — la partie
// après `watch?v=` — dans `youtubeIds`. Un ID vide masque le lecteur : la
// langue sans vidéo retombe sur l'autre, et sans aucune vidéo l'encart
// s'affiche avec le logo seul.

export type HomeEventSpotlight = {
  /** UUID du tournoi : sert au lien d'inscription (cf. registerHref). */
  tournamentId: string;
  /** Slug du tournoi : sert au lien vers sa fiche. */
  tournamentSlug: string;
  /** Inscription individuelle regroupée en équipes (tournaments.pooled_teams). */
  pooledTeams: boolean;
  soloMode: boolean;
  /** Chemin public du logo (carré). */
  logoSrc: string;
  /** ISO 8601 avec fuseau — date affichée de l'événement. */
  date: string;
  /** ISO 8601 avec fuseau — au-delà, l'encart disparaît de l'accueil. */
  visibleUntil: string;
  youtubeIds: { fr: string; en: string };
};

export const homeEventSpotlight: HomeEventSpotlight | null = {
  tournamentId: '4313f067-b7a4-4872-a8b7-5035d0596d2e',
  tournamentSlug: 'halloween-2026',
  pooledTeams: true,
  soloMode: false,
  logoSrc: '/img/events/halloween-2026.png',
  date: '2026-10-30T00:00:00+01:00',
  visibleUntil: '2026-11-01T00:00:00+01:00',
  youtubeIds: { fr: 'b-eoq-sqzZs', en: 'eWyEHbQxiaY' },
};

/** L'encart est-il à l'affiche à cet instant ? */
export function isHomeEventVisible(
  event: HomeEventSpotlight | null,
  nowIso: string
): event is HomeEventSpotlight {
  if (!event) return false;
  return new Date(nowIso).getTime() < new Date(event.visibleUntil).getTime();
}
