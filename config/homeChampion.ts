// config/homeChampion.ts
//
// L'équipe championne de l'édition, annoncée en tête d'accueil (HomeHeroV2)
// le soir de la grande finale et les semaines qui suivent.
//
// POURQUOI UN FICHIER ET PAS UN RÉGLAGE ADMIN. Comme l'encart d'événement
// (config/homeEventSpotlight) : cela arrive une fois par an, et quelques
// lignes coûtent moins cher qu'un formulaire. L'annonce se retire seule passé
// `visibleUntil` — inutile de penser à la désactiver.
//
// Le résultat recopié ici est celui de la grande finale en base (match
// `finished`, `winner_team_id`) : le vérifier avant de le publier.

export type HomeChampion = {
  /** Année de l'édition remportée. */
  year: number;
  teamName: string;
  /** Slug de l'équipe : sert au lien vers sa fiche (`/team/<slug>`). */
  teamSlug: string;
  /** Logo de l'équipe (teams.logo_url) ; null → monogramme. */
  logoUrl: string | null;
  /** Finaliste battue en grande finale. */
  runnerUp: string;
  /** Score de la grande finale, la championne en premier (« 3–1 »). */
  finalScore: string;
  /** ISO 8601 avec fuseau — au-delà, l'annonce disparaît de l'accueil. */
  visibleUntil: string;
};

export const homeChampion: HomeChampion | null = {
  year: 2026,
  teamName: 'Chocomates',
  teamSlug: 'chocomates',
  logoUrl:
    'https://yhfdhpqgmazfxyyklomp.supabase.co/storage/v1/object/public/teams-images/team-f51e782f-c95b-4b8c-95b3-b62660504212/Chocomates_DONE2__3_-512-6a2b994f02031015.webp',
  runnerUp: 'Hinode Sparkles',
  finalScore: '3–1',
  visibleUntil: '2026-12-01T00:00:00+01:00',
};

/** L'annonce est-elle à l'affiche à cet instant ? */
export function isHomeChampionVisible(
  champion: HomeChampion | null,
  nowIso: string
): champion is HomeChampion {
  if (!champion) return false;
  return new Date(nowIso).getTime() < new Date(champion.visibleUntil).getTime();
}
