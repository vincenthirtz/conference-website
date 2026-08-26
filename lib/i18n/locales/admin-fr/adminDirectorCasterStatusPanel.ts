// lib/i18n/locales/admin-fr/adminDirectorCasterStatusPanel.ts
//
// Traductions FRANCAISES du namespace `adminDirectorCasterStatusPanel` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminDirectorCasterStatusPanel', {
  unknown: 'inconnu',
  statusOnline: 'En ligne',
  statusIdle: 'Idle',
  statusOffline: 'Hors ligne',
  statusUnknown: 'Non connecte',
  tooltipNotConnected: 'Pas encore connecte',
  tooltipLastPing: 'Dernier ping : il y a {ago}',
  tooltipIdle: 'Idle depuis {ago}',
  tooltipOffline: 'Hors ligne depuis {ago}',
  errLoading: 'Erreur de chargement.',
  errPresence: 'Erreur presence.',
  heading: 'Casters',
  onlineAria: '{online} casters en ligne sur {total}',
  refreshTitle: 'Rafraichir',
  refreshAria: 'Rafraichir les casters',
  noMatchSegment: 'Aucun segment de type match dans ce run.',
  noCaster: 'Aucun caster assigne aux matches du run.',
  casterUnknown: 'Caster inconnu',
  brief: 'brief :',
  ack: 'ack :',
  ackPending: 'en attente',
  ackYes: 'Ack',
  ackNo: 'No ack',
  ackUnavailable: 'Ack indispo',
  statusAria: 'Statut : {label}. {tooltip}',
});
