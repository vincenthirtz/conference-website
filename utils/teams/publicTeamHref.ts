// utils/teams/publicTeamHref.ts
//
// L'URL PUBLIQUE d'une équipe. Une seule, partout.
//
// Il a existé deux fiches pour une même équipe : la fiche globale
// `/team/<slug>` et une fiche par tournoi `/tournament/<id>/teams/<uuid>`,
// plus pauvre. Selon la page d'où l'on cliquait, on atterrissait sur l'une ou
// sur l'autre. La seconde a été supprimée ; ce helper existe pour que la
// question « quel lien pour une équipe ? » n'ait plus qu'une réponse.
//
// Le slug prime, l'id est le repli : `slug` est vide tant qu'une équipe
// fraîchement créée n'a pas été normalisée, et la page `/team/[slug]` sait
// résoudre un UUID (elle le fait déjà pour les anciennes URLs).

export type PublicTeamRef = {
  id: string;
  slug?: string | null;
};

export function publicTeamHref(team: PublicTeamRef): string {
  return `/team/${encodeURIComponent(team.slug || team.id)}`;
}
