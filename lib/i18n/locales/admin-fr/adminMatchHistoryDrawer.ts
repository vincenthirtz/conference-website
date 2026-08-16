// lib/i18n/locales/admin-fr/adminMatchHistoryDrawer.ts
//
// Traductions FRANCAISES du namespace `adminMatchHistoryDrawer` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminMatchHistoryDrawer', {
  errorHistory: 'Erreur historique',
  close: 'Fermer',
  kicker: 'Admin · Historique',
  title: 'Historique du match',
  loading: 'Chargement…',
  empty: 'Aucune action staff enregistrée sur ce match.',
  unknownStaff: 'Staff inconnu',
  changeReason: 'Motif: {reason}',
  changeDecision: 'Décision: {resolution}',
  changeCancelled: 'Annulé',
  changeHardDelete: 'Suppression DB',
  fieldSchedule: 'horaire',
  fieldStatus: 'statut',
  fieldNotes: 'notes',
  fieldLobby: 'lobby',
  fieldReplay: 'replay',
});
