// lib/i18n/locales/fr/playerMessages.ts
//
// Traductions FRANCAISES du namespace `playerMessages` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('playerMessages', {
  pageTitle: 'Messages',
  selectTeamError: 'Selectionne une equipe.',
  gateTitle: 'Messagerie capitaine',
  gateNoTeam: "Tu dois etre membre d'une equipe pour acceder a la messagerie.",
  gateNotCaptain: "Seul le capitaine de l'equipe peut utiliser la messagerie.",
  backToSpace: 'Retour a mon espace',
  inbox: 'Inbox',
  newMessageHeader: 'Nouveau message',
  newButton: 'Nouveau',
  loading: 'Chargement...',
  noConversations: 'Aucune conversation',
  noConversationsHint: 'Envoie un premier message a un autre capitaine.',
  sendTo: 'Envoyer un message a',
  searchTeam: 'Rechercher une equipe...',
  noTeamFound: 'Aucune equipe trouvee',
  composePlaceholder: 'Ton message...',
  sending: 'Envoi...',
  send: 'Envoyer',
  noMessages: 'Aucun message dans cette conversation.',
  replyPlaceholder: 'Ecrire un message...',
  sendingShort: '...',
  yesterday: 'Hier',
  loadError: 'Impossible de charger les conversations. Réessaie plus tard.',
  composeLabel: 'Ton message',
  replyLabel: 'Écrire une réponse',
  conversationLabel: 'Fil de la conversation',
});
