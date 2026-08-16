// lib/i18n/locales/fr/casterApplication.ts
//
// Traductions FRANCAISES du namespace `casterApplication` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('casterApplication', {
  motivationTooLong: 'La motivation ne peut pas dépasser {max} caractères.',
  invalidUrl: 'Le lien doit être une URL valide (https://...).',
  alreadyStaff: 'Tu fais déjà partie du staff.',
  alreadyPending: 'Tu as déjà une demande en cours d’examen.',
  alreadyExists: 'Demande déjà existante.',
  sendFailed: 'Impossible d’envoyer ta candidature.',
  applicationSent: 'Ta candidature au cast a bien été envoyée !',
  genericError: 'Une erreur est survenue.',
  headTitle: "Rejoindre le cast | OW Women's Cup",
  backToSpace: 'Retour a mon espace',
  pageTitle: 'Rejoindre le cast',
  intro:
    'Tu veux caster nos matchs en live ? Présente ta motivation et partage un lien vers tes casts ou ta chaîne Twitch. L’équipe casting étudiera ta candidature.',
  canResubmit: 'Tu peux soumettre une nouvelle candidature ci-dessous.',
  motivationLabel: 'Motivation (optionnel)',
  motivationPlaceholder:
    'Parle-nous de ton expérience, ton style, pourquoi tu veux caster...',
  portfolioLabel: 'Lien portfolio / Twitch (optionnel)',
  portfolioPlaceholder: 'https://twitch.tv/ta-chaine',
  sending: 'Envoi en cours...',
  resubmit: 'Re-soumettre ma candidature',
  submit: 'Envoyer ma candidature',
  footer:
    "Le casting est ouvert à toutes : pas besoin d'expérience pro, juste de l'envie et de la disponibilité sur nos créneaux de stream.",
  pendingTitle: "Demande en cours d'examen",
  pendingText:
    'Ta candidature au cast a été envoyée le {date}. L’équipe casting reviendra vers toi prochainement.',
  approvedTitle: 'Bienvenue dans le cast ! 🎉',
  approvedText:
    "Ta candidature a été acceptée. Tu fais désormais partie de l'équipe casting des OW Women's Cup.",
  rejectedTitle: 'Demande non retenue',
  rejectedText:
    "Ta précédente candidature n'a pas été retenue. Tu peux re-soumettre une demande quand tu le souhaites.",
  loadError: 'Impossible de charger ta candidature. Réessaie.',
  retry: 'Réessayer',
});
