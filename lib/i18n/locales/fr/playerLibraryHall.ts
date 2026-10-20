// lib/i18n/locales/fr/playerLibraryHall.ts
//
// Traductions FRANÇAISES du namespace `playerLibraryHall` — SOURCE DE VÉRITÉ.
// Women's Library, lot 7 (le hall et ses annonces) de docs/PLAN-womens-library.md.
// Toute clé ajoutée ici doit l'être aussi côté anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('playerLibraryHall', {
  places: {
    navLabel: 'Lieux',
    apartment: 'Mon appartement',
    hall: 'Hall',
    readingRoom: 'Grande salle de lecture',
    teamHq: 'QG de mon équipe',
  },

  placeScreen: {
    loading: 'Ouverture du lieu…',
    error: 'Ce lieu n’a pas pu être ouvert.',
    retry: 'Réessayer',
  },

  // Noms des zones de la vue (infobulle au survol).
  spots: {
    board: 'Panneau d’annonces',
    readingRoom: 'Porte de la Grande salle de lecture',
    apartments: 'Porte des appartements',
    teamHq: 'Porte des QG d’équipe',
    hall: 'Porte du hall',
    shelf: 'Rayonnage',
    guichet: 'Guichet',
  },

  board: {
    title: 'Panneau d’annonces',
    intro:
      'Les dernières annonces de l’association, postées sur Discord ou sur le site.',
    loading: 'Lecture des annonces…',
    error: 'Les annonces n’ont pas pu être lues.',
    retry: 'Réessayer',
    empty: 'Aucune annonce pour le moment.',
    read: 'Lire',
    readAria: 'Lire l’annonce « {title} »',
    publishedOn: 'Publiée le {date}',
    back: 'Toutes les annonces',
    truncated: 'La suite de cette annonce est à lire sur le site.',
    readOnSite: 'Lire sur le site',
    articleLoading: 'Mise en page de l’annonce…',
  },

  doors: {
    title: 'Les portes du hall',
    readingRoom: 'Grande salle de lecture',
    readingRoomHint:
      'Un lieu calme : on y entre sans être vue, et personne ne sait qui s’y trouve.',
    apartments: 'Appartements ouverts',
    apartmentsHint:
      'Les appartements dont la propriétaire a choisi d’apparaître dans le hall.',
    teamHq: 'QG de mon équipe',
    teamHqHint: 'Le QG des équipes dont tu fais partie.',
    enter: 'Entrer',
    open: 'Voir la liste',
    openTeamHq: 'Choisir un QG',
  },

  apartments: {
    title: 'Appartements ouverts',
    intro:
      'Seuls les appartements dont la propriétaire a choisi d’apparaître ici.',
    loading: 'Lecture de la liste…',
    error: 'La liste n’a pas pu être lue.',
    retry: 'Réessayer',
    empty: 'Aucun appartement ouvert pour le moment.',
    defaultName: 'L’appartement de {nickname}',
    owner: 'Chez {nickname}',
    visit: 'Entrer',
    visitAria: 'Entrer dans « {name} »',
    more: 'Afficher plus',
    loadingMore: 'Chargement…',
  },

  settings: {
    listedOn: 'Ton appartement apparaît dans la liste du hall.',
    seeHall: 'Aller au hall',
  },

  dialog: {
    close: 'Fermer',
  },
});
