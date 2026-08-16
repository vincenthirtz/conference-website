// lib/i18n/locales/fr/publicScrimDialog.ts
//
// Traductions FRANCAISES du namespace `publicScrimDialog` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('publicScrimDialog', {
  title: 'Proposer un scrim à {teamName}',
  subtitle:
    'Le capitaine recevra ta demande et pourra te répondre via le contact que tu fournis ci-dessous.',
  close: 'Fermer',
  fromTeamLabel: 'Équipe demandeuse',
  fromTeamPlaceholder: 'Nom de ton équipe',
  nameLabel: 'Nom du contact',
  namePlaceholder: 'Pseudo ou prénom',
  emailLabel: 'Email',
  emailPlaceholder: 'contact@example.com',
  discordLabel: 'Discord (optionnel)',
  discordPlaceholder: 'pseudo ou invite Discord',
  dateLabel: 'Date souhaitée',
  formatLabel: 'Format',
  formatPlaceholder: 'ex. 5v5 BO3',
  messageLabel: 'Message (optionnel)',
  messagePlaceholder: 'Précise tes disponibilités, le serveur, etc.',
  captchaLabel: 'Anti-bot — combien font {question} ?',
  captchaPlaceholder: 'Réponds par un nombre',
  cancel: 'Annuler',
  submitting: 'Envoi…',
  submit: 'Envoyer la demande',
  errorFailed: 'Échec de la demande.',
  successFallback: 'Demande envoyée.',
  errorUnknown: 'Erreur inconnue.',
});
