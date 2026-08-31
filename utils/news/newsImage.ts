// utils/news/newsImage.ts
//
// Quelle image illustre un article ?
//
// Les actus auto-générées parlent d'une équipe (« X rejoint Eclypse »). Elles
// copiaient son logo dans `news.image_url` à la publication — une photo prise
// à un instant, que rien ne rafraîchissait : l'équipe qui posait son logo
// ensuite ne le voyait jamais apparaître sur ses articles.
//
// Depuis `add_news_team_id.sql`, l'article DÉSIGNE son équipe (`news.team_id`)
// et l'image se résout ici, à la lecture. L'ordre de priorité est le seul point
// à retenir :
//
//   1. `image_url` — un choix ÉDITORIAL explicite. Une actu illustrée à la main
//      garde son visuel même si elle est rattachée à une équipe.
//   2. le logo de l'équipe liée, lu en direct : ajouter ou changer un logo se
//      répercute sur tout l'historique.
//   3. rien — l'appelant rend son dégradé de repli.
//
// Fonction PURE, partagée par toutes les surfaces publiques (home, /news,
// /news/[slug], /api/news, RSS) pour qu'elles ne divergent pas.

/**
 * Forme minimale d'une ligne `news` jointe à son équipe. Les lectures
 * PostgREST rendent l'embed soit en objet, soit en tableau à un élément selon
 * la façon dont la relation est déclarée : les deux sont acceptés ici plutôt
 * que de laisser chaque appelant s'en débrouiller.
 */
export type NewsTeamEmbed =
  | { logo_url?: string | null }
  | Array<{ logo_url?: string | null }>
  | null
  | undefined;

/** Renvoie le logo porté par l'embed, quelle que soit sa forme. */
export function readTeamLogo(team: NewsTeamEmbed): string | null {
  if (!team) return null;
  const row = Array.isArray(team) ? team[0] : team;
  const logo = row?.logo_url;
  return typeof logo === 'string' && logo.trim() ? logo : null;
}

/**
 * Image à afficher pour un article, ou `null` s'il n'y en a aucune.
 *
 * Une chaîne vide vaut « pas d'image » : `image_url` est nullable en base mais
 * plusieurs chemins d'écriture y déposent `''`, et un `src=""` casse le rendu.
 */
export function resolveNewsImageUrl(
  imageUrl: string | null | undefined,
  team: NewsTeamEmbed
): string | null {
  if (typeof imageUrl === 'string' && imageUrl.trim()) return imageUrl;
  return readTeamLogo(team);
}

/**
 * Cette URL désigne-t-elle un LOGO plutôt qu'une bannière ?
 *
 * Un logo est carré ou vertical, souvent détouré : le recadrer en `cover` lui
 * coupe la tête. Le cas n'était traité que pour les logos d'ÉQUIPE, parce que
 * c'était le seul chemin qui en produisait ; une actu illustrée à la main avec
 * le logo du tournoi tombait dans le cadrage bannière et se faisait rogner.
 *
 * La convention porte sur le dossier — `public/img/logos/` — et non sur le nom
 * de fichier, pour qu'y déposer un nouveau visuel suffise.
 */
export function isLogoAsset(url: string | null | undefined): boolean {
  return typeof url === 'string' && /\/img\/logos\//.test(url);
}

export type ResolvedNewsImage = {
  /** URL à afficher, ou `null` : l'appelant rend alors son dégradé de repli. */
  url: string | null;
  /**
   * Vrai quand l'image est un LOGO et non une bannière : logo de l'équipe liée,
   * ou visuel éditorial rangé dans `public/img/logos/`.
   *
   * Ça décrit le CADRAGE, pas la provenance — c'est d'ailleurs tout ce que les
   * appelants en font. Une bannière se recadre volontiers en `object-cover`, un
   * logo carré s'y fait massacrer : les surfaces basculent sur `object-contain`
   * quand ce drapeau est vrai.
   */
  fitContain: boolean;
};

/** Variante de `resolveNewsImageUrl` qui dit AUSSI comment la cadrer. */
export function resolveNewsImage(
  imageUrl: string | null | undefined,
  team: NewsTeamEmbed
): ResolvedNewsImage {
  if (typeof imageUrl === 'string' && imageUrl.trim()) {
    return { url: imageUrl, fitContain: isLogoAsset(imageUrl) };
  }
  const logo = readTeamLogo(team);
  return { url: logo, fitContain: logo !== null };
}
