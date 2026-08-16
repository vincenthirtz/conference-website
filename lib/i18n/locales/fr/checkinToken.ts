// lib/i18n/locales/fr/checkinToken.ts
//
// Traductions FRANCAISES du namespace `checkinToken` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('checkinToken', {
  title: 'Check-in match',
  subtitle: 'Confirmez la présence de votre équipe.',
  invalidLinkTitle: 'Lien invalide',
  invalidLinkHint:
    "Si vous pensez qu'il s'agit d'une erreur, contactez l'organisateur sur Discord.",
  rowTournament: 'Tournoi',
  rowYourTeam: 'Votre équipe',
  rowOpponent: 'Adversaire',
  rowStart: 'Début prévu',
  confirmedTitle: 'Check-in confirmé',
  confirmedBody: "Votre équipe est attendue à l'heure du match. Bonne chance !",
  closedTitle: 'Check-in fermé',
  closedBody: 'Le match a déjà été traité (statut : {status}).',
  saving: 'Enregistrement...',
  confirmBtn: 'Confirmer la présence',
  forfeitNote:
    'Sans check-in avant le début du match, votre équipe sera déclarée forfait automatiquement.',
  footer: "OW Women's Cup — Check-in",
  errInvalidLink: 'Lien invalide',
  errNetwork: 'Erreur réseau',
  errCheckinFailed: 'Échec du check-in',
});
