// lib/i18n/locales/admin-fr/adminMatchForfeitProposal.ts
//
// Traductions FRANCAISES du namespace admin `adminMatchForfeitProposal` —
// SOURCE DE VERITE. Le pendant anglais vit dans
// `../admin-en/adminMatchForfeitProposal.ts`.

import { adminNs } from '../../ns';

export default adminNs('adminMatchForfeitProposal', {
  heading: 'Forfait proposé',
  body: '{absent} n’a pas fait son check-in avant le coup d’envoi. Le forfait n’est PAS appliqué automatiquement : confirmez-le ou refusez-le.',
  proposedWinner: 'Vainqueur si confirmé : {winner}',
  proposedAt: 'Proposé le {date}',
  confirm: 'Confirmer le forfait',
  decline: 'Refuser',
  confirming: 'Application…',
  declining: 'Refus…',
  confirmTitle: 'Confirmer le forfait de {absent} ?',
  confirmMessage:
    'Le score de forfait est écrit, le match passe en « forfait » et le bracket avance. Les équipes sont prévenues.',
  declineTitle: 'Refuser la proposition ?',
  declineMessage:
    'Rien ne change sur le match. Saisissez ensuite le score, ou appliquez un forfait manuel si besoin.',
  overrideHint: 'Saisir un score sur ce match écarte aussi la proposition.',
  unknownTeam: 'Équipe inconnue',
  errorGeneric: 'La décision n’a pas pu être enregistrée.',
  errorNotPending:
    'Cette proposition a déjà été tranchée (ou écartée par une saisie de score).',
});
