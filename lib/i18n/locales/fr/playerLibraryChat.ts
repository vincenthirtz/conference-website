// lib/i18n/locales/fr/playerLibraryChat.ts
//
// Traductions FRANÇAISES du namespace `playerLibraryChat` — SOURCE DE VÉRITÉ.
// Women's Library, lot 6 (chat interne et sa modération) de docs/PLAN-womens-library.md.
// Toute clé ajoutée ici doit l'être aussi côté anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.
//
// Les `code` de l'API (`chat_muted`, `chat_filtered`…) sont traduits dans
// `errors`, une entrée par code de `LIBRARY_CHAT_CODES` (+ quelques clés du
// site : salle fermée, 429, bannie, autre). Un refus du filtre ne dit JAMAIS
// quel mot a été reconnu.

import { ns } from '../../ns';

export default ns('playerLibraryChat', {
  title: 'Chat de la salle',
  feedLabel: 'Messages de la salle',
  loading: 'Chargement des messages…',
  loadError: 'Les messages n’ont pas pu être chargés.',
  retry: 'Réessayer',
  empty: 'Aucun message pour l’instant.',
  you: 'toi',
  hiddenMessage: 'Message masqué par la modération.',
  plainText:
    'Texte brut : les liens ne sont pas cliquables, les e-mails et numéros de téléphone sont masqués. Pas de messages privés.',
  closedTitle: 'Le chat est fermé pour le moment',
  closedBody: 'Les emotes et les phrases restent disponibles.',
  readOnly: 'Seules les membres de l’équipe écrivent dans ce QG.',
  mutedUntil: 'Tu es en sourdine jusqu’au {time}.',
  muted: 'Tu es en sourdine pour le moment.',

  composer: {
    label: 'Ton message',
    placeholder: 'Écris à la salle…',
    send: 'Envoyer',
    sending: 'Envoi…',
    counter: '{count} / {max}',
    counterLabel: '{count} caractères sur {max}',
    tooLong: 'Ton message dépasse {max} caractères.',
    masked:
      'Une coordonnée (e-mail ou téléphone) a été masquée dans ton message.',
  },

  // Refus de l'API, par `code`.
  errors: {
    chat_disabled:
      'Le chat vient d’être fermé. Les emotes restent disponibles.',
    chat_silent_room: 'La Grande salle de lecture est silencieuse.',
    chat_read_only: 'Seules les membres de l’équipe écrivent dans ce QG.',
    chat_muted: 'Tu es en sourdine pour le moment.',
    chat_too_fast:
      'Doucement : attends {seconds} s avant ton prochain message.',
    chat_duplicate: 'Tu viens d’envoyer ce message.',
    chat_empty: 'Ton message est vide.',
    chat_too_long: 'Ton message dépasse {max} caractères.',
    chat_filtered:
      'Ce message n’est pas autorisé : il contient une insulte ou une injure. Reformule-le.',
    message_not_found: 'Ce message n’existe plus.',
    chat_moderation_forbidden: 'Tu ne peux pas modérer ce chat.',
    cannot_mute_self: 'Tu ne peux pas te mettre en sourdine.',
    cannot_report_own_message: 'Tu ne peux pas signaler ton propre message.',
    player_not_found: 'Cette joueuse n’est plus dans la Library.',
    report_failed:
      'Le signalement n’a pas pu être enregistré. Réessaie, ou écris à l’équipe depuis la page Support.',
    room_closed: 'Tu n’as plus accès à cette salle.',
    library_banned: 'Ton accès à la Women’s Library est suspendu.',
    rate_limited: 'Trop de demandes d’un coup. Patiente un peu, puis réessaie.',
    generic: 'Ça n’a pas marché. Réessaie dans un instant.',
  },

  // Les gestes sur un message.
  actions: {
    open: 'Actions pour le message de {nickname}',
    report: 'Signaler ce message',
    hide: 'Masquer pour toutes',
    mute: 'Mettre en sourdine',
  },
  hide: {
    title: 'Masquer ce message ?',
    body: 'Il disparaît pour toutes les personnes présentes. Une copie reste dans un signalement s’il y en a un.',
    confirm: 'Masquer',
    pending: 'Masquage…',
    done: 'Message masqué.',
  },
  mute: {
    title: 'Mettre {nickname} en sourdine',
    body: 'Elle ne pourra plus écrire dans cette salle pendant :',
    durations: {
      min30: '30 minutes',
      hour1: '1 heure',
      hours24: '24 heures',
    },
    confirm: 'Mettre en sourdine',
    pending: 'Mise en sourdine…',
    done: '{nickname} est en sourdine jusqu’au {time}.',
  },
  report: {
    title: 'Signaler un message de {nickname}',
    intro:
      'Le message et les 10 qui le précèdent sont copiés dans ton signalement : la preuve reste, même après l’effacement du chat (30 jours).',
    reasonLegend: 'Motif',
    reasons: {
      harassment: 'Harcèlement, menaces, insistance',
      hate: 'Propos haineux',
      personal_info: 'Coordonnées ou informations personnelles divulguées',
      minor: 'Mineure présumée',
      other: 'Autre',
    },
    detailsLabel: 'Précisions (facultatif)',
    counter: '{count} / {max} caractères',
    confidential: 'La personne signalée ne saura jamais qui l’a signalée.',
    submit: 'Envoyer le signalement',
    submitting: 'Envoi…',
    successTitle: 'Merci, c’est transmis',
    reference: 'Référence : {reference}',
  },
  cancel: 'Annuler',
  close: 'Fermer',
});
