// utils/news/newsTag.ts
//
// Le libellé affichable d'un tag d'actualité.
//
// LE PROBLÈME. `news.tag` stocke un slug technique, et il est écrit par trois
// chemins qui ne se sont jamais concertés : la publication multi-cibles pose
// `announcements`, l'ingestion Discord reprend le nom du salon, l'admin laisse
// saisir ce qu'on veut. La base contient donc `teams`, `announcements`,
// `tournaments`, mais aussi `tournois`, `tournament`, `evenement`, `update`.
//
// Quatre surfaces (home, /news, /news/[slug], la bande d'actus) faisaient
// chacune la même chose : mettre une majuscule au slug. Résultat à l'écran
// d'un site francophone : « ANNOUNCEMENTS », « TEAMS », « TOURNAMENTS ».
//
// CE MODULE traduit les slugs connus — dans les deux sens, `tournament` et
// `tournois` désignant la même chose — et retombe sur la capitalisation pour
// les inconnus, plutôt que d'afficher un blanc ou le mot « general ».
//
// Module PUR : les quatre surfaces l'importent, y compris côté client.

/**
 * Slugs regroupés par sens. La clé est la FAMILLE, pas l'orthographe : c'est
 * ce qui permet de rassembler les variantes accumulées au fil des chemins
 * d'écriture sans avoir à corriger l'historique en base.
 */
const TAG_FAMILIES: Record<string, readonly string[]> = {
  announcements: ['announcements', 'announcement', 'annonces', 'annonce'],
  tournaments: [
    'tournaments',
    'tournament',
    'tournois',
    'tournoi',
    'competition',
  ],
  teams: ['teams', 'team', 'equipes', 'equipe'],
  events: ['events', 'event', 'evenement', 'evenements', 'évènement'],
  updates: ['update', 'updates', 'patch', 'patchnotes'],
  general: ['general', 'général', 'divers'],
};

/** Famille d'un slug, ou `null` s'il n'en relève d'aucune. */
export function newsTagFamily(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const needle = tag
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s_-]+/g, '');
  if (!needle) return null;

  for (const [family, slugs] of Object.entries(TAG_FAMILIES)) {
    const match = slugs.some(
      (slug) =>
        slug
          .toLowerCase()
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[\s_-]+/g, '') === needle
    );
    if (match) return family;
  }
  return null;
}

/**
 * Libellé affichable.
 *
 * `labels` vient de l'i18n de l'appelant (namespace `newsTags`). Un slug hors
 * famille garde sa forme lisible : mieux vaut afficher le mot tel qu'il a été
 * saisi qu'un fourre-tout « Général » qui effacerait l'intention.
 */
export function newsTagLabel(
  tag: string | null | undefined,
  labels: Record<string, string>
): string | null {
  if (!tag) return null;
  const family = newsTagFamily(tag);
  if (family && labels[family]) return labels[family];

  const cleaned = tag.replace(/[-_]/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
