// lib/i18n/locales/fr/checkin.ts
//
// Traductions FRANCAISES du namespace `checkin` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('checkin', {
  loadError: 'Erreur lors du chargement de ton match.',
  submitFailed: 'Le check-in a échoué.',
  submitNetwork: 'Erreur réseau au check-in.',
  backToMatches: 'Mes matchs',
  title: 'Check-in',
  subtitle: "Valide ta présence avant le coup d'envoi.",
  signinPrompt: 'Connecte-toi pour valider ton check-in.',
  signin: 'Se connecter',
  noMatchTitle: 'Aucun match à valider pour le moment',
  noMatchBody:
    "Le check-in s'ouvre peu avant le coup d'envoi de ton prochain match.",
  seeMatches: 'Voir mes matchs',
  opponentTbd: 'Adversaire à définir',
  dateToCome: 'Date à venir',
  noWindow: 'Aucune fenêtre de check-in pour ce match.',
  checkedInTitle: 'Check-in validé',
  confirmed: 'Ta présence est confirmée.',
  validatedAt: 'Validé à {time} (heure de Paris).',
  openTitle: 'Le check-in est ouvert',
  openBody: 'Valide ta présence dès maintenant.',
  closesIn: 'Fenêtre fermée dans',
  submitting: 'Validation…',
  submit: 'Valider le check-in',
  notOpenTitle: "Le check-in n'est pas encore ouvert",
  opensAtPrefix: 'Il ouvrira à',
  opensAtSuffix: '(heure de Paris).',
  opensIn: 'Ouverture dans',
  passedTitle: 'La fenêtre de check-in est fermée',
  passedBody:
    "Tu n'as pas validé ton check-in à temps. Contacte le staff si c'est une erreur.",
  contactStaff: 'Contacter le staff',
  unavailable: "Le check-in n'est pas disponible pour ce match.",
  successToast: 'Présence confirmée ! Tu es bien check-in pour ce match.',
  alreadyToast: 'Tu étais déjà check-in pour ce match.',
  confirmedHeading: 'Présence confirmée ✓',
});
