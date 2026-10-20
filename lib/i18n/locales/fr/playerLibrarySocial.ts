// lib/i18n/locales/fr/playerLibrarySocial.ts
//
// Traductions FRANCAISES du namespace `playerLibrarySocial` — SOURCE DE VERITE.
// Le multijoueur de la Women's Library (lot 5 de docs/PLAN-womens-library.md) :
// emotes et phrases predefinies, menu d'un avatar (bloquer, signaler,
// expulser), signalement, mode discret de la Grande salle de lecture, notices
// d'expulsion, de bannissement et de refus d'entree.
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.
//
// LES EMOTES ET LES PHRASES circulent en IDENTIFIANTS (`wave`, `hello`) :
// chaque cliente lit ici la traduction de SA langue, rien de libre ne passe.
// LE BLOCAGE EST SILENCIEUX : aucun texte lu par la personne bloquee ne doit
// le laisser deviner (`notice.closedTitle`, `notice.forbiddenTitle`).
// Les `code` de l'API (`room_forbidden`, `player_not_found`…) sont traduits
// dans `codes`, une entree par code de `LIBRARY_SOCIAL_CODES`.

import { ns } from '../../ns';

export default ns('playerLibrarySocial', {
  emotes: {
    wave: 'Saluer',
    clap: 'Applaudir',
    heart: 'Cœur',
    laugh: 'Rire',
    dance: 'Danser',
  },
  phrases: {
    hello: 'Salut !',
    gg: 'GG',
    play: 'On joue ?',
    thanks: 'Merci',
    bye: 'À plus',
    welcome: 'Bienvenue',
  },

  // La barre des signes, sous la salle.
  emoteBar: {
    label: 'Emotes et phrases',
    emotesGroup: 'Emotes',
    phrasesGroup: 'Phrases',
    silentRoom:
      'Salle silencieuse : pas de phrases, seulement quelques emotes douces.',
    disabled: {
      discreet:
        'Tu es discrète : personne ne te voit. Deviens visible pour faire signe.',
      hidden: 'Tu ne peux pas te montrer dans cette salle pour le moment.',
      offline: 'Connexion à la salle…',
    },
    tooFast: 'Doucement : un signe par seconde.',
  },

  // Grande salle de lecture : on y entre sans être vue.
  discreet: {
    legend: 'Ta présence dans la salle',
    stay: 'Rester discrète',
    show: 'Être visible',
    explainDiscreet:
      'Personne ne te voit. Toi, tu vois celles qui ont choisi d’être visibles.',
    explainVisible:
      'Les autres te voient, toi et tes signes. Tu peux redevenir discrète à tout moment.',
    cannotShow: 'Tu ne peux pas te rendre visible pour le moment.',
  },

  // Le menu d'un avatar (clic ou toucher sur elle).
  menu: {
    label: 'Actions pour {nickname}',
    block: 'Bloquer',
    report: 'Signaler',
    kick: 'Expulser',
    cancel: 'Annuler',
    close: 'Fermer',
    blockTitle: 'Bloquer {nickname} ?',
    blockBody:
      'Vous ne vous verrez plus dans la Library, et aucune de vous deux ne pourra entrer dans l’appartement de l’autre.',
    blockSilent: '{nickname} n’en est pas avertie.',
    blockConfirm: 'Bloquer',
    blockPending: 'Blocage…',
    blockDone: '{nickname} est bloquée : vous ne vous verrez plus.',
    kickTitle: 'Expulser {nickname}',
    kickBody:
      'Elle quitte ton appartement et ne pourra pas y revenir avant la fin de l’expulsion.',
    kickDuration: 'Durée',
    kickDurations: {
      min30: '30 minutes',
      hour1: '1 heure',
      hours24: '24 heures',
    },
    kickConfirm: 'Expulser',
    kickPending: 'Expulsion…',
    kickDone: '{nickname} est expulsée de ton appartement jusqu’au {until}.',
  },

  // Signaler un avatar : part à la modération (ticket `behavior`).
  report: {
    title: 'Signaler {nickname}',
    intro: 'Ton signalement part à l’équipe de modération de l’association.',
    reasonLegend: 'Motif',
    reasons: {
      harassment: {
        label: 'Harcèlement',
        help: 'Insultes, menaces, insistance, propos haineux.',
      },
      minor: {
        label: 'Mineure présumée',
        help: 'La Library est réservée aux adultes : l’équipe vérifie, et peut la bannir.',
      },
      impersonation: {
        label: 'Usurpation d’identité',
        help: 'Elle se fait passer pour quelqu’un d’autre : une joueuse, une streameuse, l’équipe.',
      },
      other: {
        label: 'Autre',
        help: 'Un autre comportement qui te met mal à l’aise.',
      },
    },
    detailsLabel: 'Précisions (facultatif)',
    detailsHint:
      'Ce qui s’est passé, et quand. Inutile d’y mettre tes coordonnées.',
    counter: '{count} / {max} caractères',
    confidential: 'La personne signalée ne saura jamais qui l’a signalée.',
    safetyLink: 'Ressources et aide',
    newTab: '(nouvel onglet)',
    submit: 'Envoyer le signalement',
    submitting: 'Envoi…',
    cancel: 'Annuler',
    close: 'Fermer',
    successTitle: 'Merci, c’est transmis',
    successBody: 'L’équipe de modération va lire ton signalement.',
    reference: 'Référence : {reference}',
    referenceHint: 'Cite-la si tu écris à l’équipe.',
    blockHint: 'Pour ne plus la voir, tu peux aussi la bloquer.',
  },

  // Ce qui s'affiche à la place de la salle. `closed` / `forbidden` : JAMAIS
  // un mot qui laisserait deviner un blocage.
  notice: {
    kickedTitle: 'Tu as quitté cet appartement',
    kickedBody:
      'Sa propriétaire t’a demandé de partir. Tu pourras revenir à partir du {until}.',
    kickedEnterTitle: 'Pas tout de suite',
    kickedEnterUntil:
      'Tu ne pourras pas entrer dans cet appartement avant le {until}.',
    kickedEnterLater:
      'Tu ne peux pas entrer dans cet appartement pour le moment.',
    bannedTitle: 'Accès à la Library suspendu',
    bannedUntil:
      'Ton accès à la Women’s Library est suspendu jusqu’au {until}.',
    bannedBody: 'Ton accès à la Women’s Library est suspendu.',
    bannedHelp: 'Une question ? L’équipe peut te répondre.',
    supportLink: 'Contacter l’équipe',
    closedTitle: 'Cette salle n’est plus accessible',
    forbiddenTitle: 'Cette salle n’est pas accessible',
    elsewhere: 'Tu peux poursuivre ta visite ailleurs dans la Library.',
    notFoundTitle: 'Salle introuvable',
    notFoundBody: 'Cette salle n’existe pas, ou plus.',
    connectionTitle: 'Connexion interrompue',
    connectionBody: 'La salle ne répond plus. Réessaie dans un instant.',
    errorTitle: 'Impossible d’entrer',
    errorBody: 'La salle n’a pas pu s’ouvrir. Réessaie dans un instant.',
  },

  // L'écran d'une salle (lot 5 phase B) : la scène, la liste des présentes
  // (accès clavier et lecteur d'écran aux avatars), le repère dessiné
  // au-dessus de soi quand on n'est pas visible.
  room: {
    loading: 'Entrée dans la salle…',
    canvasLabel:
      'La salle en vue isométrique. Les joueuses présentes sont listées sous la vue.',
    resetView: 'Recentrer la vue',
    hint: 'Touche le sol pour te déplacer, touche une joueuse pour la bloquer ou la signaler.',
    presentTitle: 'Présentes dans la salle',
    presentCount_one: '{count} autre joueuse visible',
    presentCount_other: '{count} autres joueuses visibles',
    presentEmpty: 'Personne d’autre n’est visible pour l’instant.',
    presentHint: 'Choisis une joueuse pour ouvrir ses actions.',
    discreetMarker: 'discrète',
    backToApartment: 'Retour à mon appartement',
    retry: 'Réessayer',
    visiting: 'En visite',
    names: {
      hall: 'Le hall',
      reading_room: 'La Grande salle de lecture',
      team_hq: 'Un QG d’équipe',
      apartment: 'Un appartement',
    },
  },

  // Refus de l'API, par `code` (+ trois clés du site : 429, bannie, autre).
  codes: {
    room_not_found: 'Cette salle n’existe pas, ou plus.',
    room_forbidden: 'Cette salle n’est pas accessible.',
    room_kicked: 'Tu ne peux pas entrer dans cette salle pour le moment.',
    player_not_found: 'Cette joueuse n’est plus dans la Library.',
    cannot_block_self: 'Tu ne peux pas te bloquer toi-même.',
    cannot_report_self: 'Tu ne peux pas te signaler toi-même.',
    cannot_kick_self: 'Tu ne peux pas t’expulser de chez toi.',
    apartment_not_found:
      'Tu n’as pas encore d’appartement : tu ne peux expulser personne.',
    report_failed:
      'Le signalement n’a pas pu être enregistré. Réessaie, ou écris à l’équipe depuis la page Support.',
    rate_limited: 'Trop de demandes d’un coup. Patiente un peu, puis réessaie.',
    library_banned: 'Ton accès à la Women’s Library est suspendu.',
    generic: 'Ça n’a pas marché. Réessaie dans un instant.',
  },
});
