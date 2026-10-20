// lib/i18n/locales/fr/playerLibraryTeamHq.ts
//
// Traductions FRANÇAISES du namespace `playerLibraryTeamHq` — SOURCE DE VÉRITÉ.
// Women's Library, lot 9 (les QG d'équipe) de docs/PLAN-womens-library.md.
// Toute clé ajoutée ici doit l'être aussi côté anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.
//
// Les `code` de l'API (`room_forbidden`, `team_hq_no_space`…) sont traduits
// dans `codes`, une entrée par clé de `TEAM_HQ_ERROR_KEYS`
// (features/player/library/teamHq/model.ts), plus `generic`.

import { ns } from '../../ns';

export default ns('playerLibraryTeamHq', {
  // La porte « QG de mon équipe » (hall, navigation des lieux).
  door: {
    title: 'QG de mon équipe',
    intro:
      'Retrouvez-vous au QG de votre équipe : le prochain match, le salon Discord, et une salle à décorer ensemble.',
    loading: 'Recherche de tes équipes…',
    error: 'Tes équipes n’ont pas pu être chargées.',
    retry: 'Réessayer',
    none: 'Tu n’es membre d’aucune équipe pour l’instant.',
    joinLink: 'Rejoindre une équipe',
    enter: 'Entrer au QG',
    enterAria: 'Entrer au QG de {team}',
    entering: 'Ouverture…',
    notCreated: 'Il s’ouvrira à ta première visite.',
  },

  // Le panneau sous la salle.
  panel: {
    title: 'QG de {team}',
    logoAlt: 'Logo de {team}',
    loading: 'Chargement du QG…',
    error: 'Le panneau du QG n’a pas pu être chargé.',
    retry: 'Réessayer',
    staffNote:
      'Tu visites ce QG en tant que staff : tu y entres, mais tu n’y prêtes pas de meubles.',
  },

  // Le prochain match (les données du tableau de bord).
  match: {
    title: 'Prochain match',
    none: 'Aucun match à venir pour l’instant.',
    versus: '{team} contre {opponent}',
    opponentTbd: 'adversaire à déterminer',
    whenTbd: 'Date à fixer',
    bestOf: 'Au meilleur des {n} manches',
    checkinOpen: 'Le check-in est ouvert : pointe depuis ton tableau de bord.',
    checkinDone: 'Check-in fait.',
    checkinSoon: 'Check-in à partir du {date}.',
    dashboardLink: 'Mon tableau de bord',
    streamLink: 'Voir le stream',
  },

  // La porte vers le salon Discord de l'équipe.
  discord: {
    title: 'Salon Discord',
    open: 'Ouvrir le salon Discord de l’équipe',
    openAria: 'Ouvrir le salon Discord de l’équipe (nouvel onglet)',
    none: 'L’équipe n’a pas encore de salon Discord.',
  },

  // Les meubles prêtés, et le prêt.
  furniture: {
    title: 'Meubles prêtés au QG',
    empty: 'Aucun meuble pour l’instant : chaque membre peut prêter les siens.',
    count_one: '{count} meuble',
    count_other: '{count} meubles',
    lentByMe: 'Prêté par toi',
    lentBy: 'Prêté par {nickname}',
    lentByUnknown: 'Prêté par une membre',
    position: 'Case {gx}, {gy}',
    move: 'Déplacer',
    moveAria: 'Déplacer {name}',
    takeBack: 'Reprendre',
    takeBackAria: 'Reprendre {name}',
    giveBack: 'Rendre',
    giveBackAria: 'Rendre {name} à sa propriétaire',
    lendTitle: 'Prêter un meuble',
    lendIntro:
      'Un meuble prêté reste à toi : tu le reprends quand tu veux, et il te revient si tu quittes l’équipe.',
    lendEmpty:
      'Tous tes meubles sont déjà posés. Range-en un chez toi pour le prêter au QG.',
    lend: 'Prêter',
    lendAria: 'Prêter {name} au QG',
    lendPlaced:
      'Il se pose à la première place libre ; tu pourras le déplacer.',
    working: 'Un instant…',
    refresh: 'Voir le QG à jour',
    changed:
      'Le QG a changé : actualise la salle pour voir les meubles à leur place.',
    done: {
      lent: '{name} est prêté au QG.',
      moved: '{name} a été déplacé.',
      returned: '{name} est revenu à sa propriétaire.',
    },
  },

  // Déplacer un meuble prêté, sans le canevas (clavier, lecteur d'écran).
  move: {
    title: 'Déplacer {name}',
    gx: 'Colonne (0 à {max})',
    gy: 'Rangée (0 à {max})',
    rotation: 'Orientation',
    rotations: {
      r0: 'Vers le fond',
      r1: 'Quart de tour',
      r2: 'Demi-tour',
      r3: 'Trois quarts de tour',
    },
    valid: 'Il tient ici.',
    unknown: 'Ce meuble ne peut pas être posé.',
    submit: 'Poser ici',
    cancel: 'Annuler',
  },

  codes: {
    room_forbidden: 'Ce QG n’est ouvert qu’aux membres de l’équipe.',
    room_not_found: 'Ce QG n’existe plus.',
    team_not_found: 'Cette équipe n’existe plus.',
    team_hq_members_only:
      'Seules les membres de l’équipe prêtent des meubles à son QG.',
    team_hq_no_space:
      'Plus de place libre pour ce meuble : déplace ou reprends un meuble d’abord.',
    team_hq_full:
      'Le QG est plein : reprends un meuble avant d’en prêter un autre.',
    item_not_lent: 'Ce meuble n’est plus prêté au QG.',
    return_forbidden:
      'Seules sa propriétaire, la capitaine et les managers rendent ce meuble.',
    item_placed_elsewhere:
      'Ce meuble est posé ailleurs (dans ton appartement ?) : range-le d’abord.',
    room_conflict: 'Le QG vient de changer : réessaie.',
    placement_invalid: 'Ce meuble ne tient pas à cette place.',
    library_unavailable: 'La Library est momentanément indisponible.',
    generic: 'Ça n’a pas abouti. Réessaie.',
  },
});
