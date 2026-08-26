// lib/i18n/locales/admin-fr/adminEmailLogs.ts
//
// Traductions FRANCAISES du namespace `adminEmailLogs` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminEmailLogs', {
  pageTitle: 'Admin – Logs emails (Brevo)',
  viewMessages: 'Messages',
  viewEvents: 'Événements',
  viewToggleAria: 'Choisir la vue : messages ou événements',
  messagesCount: '{count} email(s) distinct(s)',
  eventRequests: 'Envoyé',
  eventDelivered: 'Délivré',
  eventOpened: 'Ouvert',
  eventClicks: 'Cliqué',
  eventSoftBounces: 'Soft bounce',
  eventHardBounces: 'Hard bounce',
  eventSpam: 'Spam',
  eventBlocked: 'Bloqué',
  eventInvalid: 'Invalide',
  eventDeferred: 'Différé',
  backToDashboard: 'Retour au dashboard admin',
  heading: 'Logs emails',
  subtitle: 'Historique des emails transactionnels via Brevo',
  quota: '300 emails/jour (gratuit)',
  retry: 'Réessayer',
  testHeading: 'Envoyer un email de test',
  testPlaceholder: 'destinataire@example.com',
  testSend: 'Envoyer',
  toastTestSent: 'Email envoyé ({id})',
  testFailed: 'Échec',
  errorNetwork: 'Erreur réseau',
  labelEmail: 'Email',
  placeholderEmail: 'destinataire@...',
  labelStatus: 'Statut',
  statusAll: 'Tous',
  labelFrom: 'Du',
  labelTo: 'Au',
  filter: 'Filtrer',
  empty: 'Aucun email trouvé pour ces filtres',
  from: 'De : {from}',
  idLabel: 'ID : {id}…',
  previous: 'Précédent',
  next: 'Suivant',
  errorUnexpected: 'Erreur inattendue',
});
