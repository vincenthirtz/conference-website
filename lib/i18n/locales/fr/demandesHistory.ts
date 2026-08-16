// lib/i18n/locales/fr/demandesHistory.ts
//
// Traductions FRANCAISES du namespace `demandesHistory` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('demandesHistory', {
  title: 'Historique des demandes',
  cancel: 'Annuler',
  cancelError: 'Erreur',
  badgeNew: 'Nouveau',
  reasonLabel: 'Motif : {note}',
  typeLabels: {
    captain_request: 'Demande de capitaine',
    join: 'Rejoindre une equipe',
    leave: "Quitter l'equipe",
    other: 'Demande',
  },
  statusLabels: {
    pending: 'En attente',
    approved: 'Approuvee',
    rejected: 'Refusee',
    cancelled: 'Annulee',
  },
  cancelConfirmTitle: 'Annuler cette demande ?',
  cancelConfirmSubtitle:
    'La demande sera définitivement retirée. Tu pourras en refaire une plus tard.',
  cancelConfirmYes: 'Oui, annuler',
  cancelConfirmNo: 'Garder',
});
