// lib/i18n/locales/fr/invitationLink.ts
//
// Traductions FRANCAISES du namespace `invitationLink` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('invitationLink', {
  pageTitle: 'Invitation à rejoindre une équipe',
  eyebrow: 'Invitation',
  heading: 'Rejoindre {team}',
  body: "Tu es invité(e) à rejoindre l'équipe {team} en tant que {role}.",
  captainNote: "En acceptant, tu prends le capitanat de l'équipe.",
  sentTo: 'Invitation envoyée à {email}',
  accept: "Accepter l'invitation",
  reject: 'Refuser',
  pending: 'Un instant…',
  loading: 'Chargement…',
  loginRequired:
    "Connecte-toi avec l'adresse invitée pour accepter ou refuser.",
  loginCta: 'Se connecter',
  acceptedTitle: 'Bienvenue !',
  acceptedBody: "Tu fais désormais partie de l'équipe {team}.",
  acceptedCaptainBody: "Tu es désormais capitaine de l'équipe {team}.",
  rejectedTitle: 'Invitation refusée',
  rejectedBody: "L'équipe a été informée que tu déclines l'invitation.",
  goToTeamSpace: 'Voir mon espace équipe',
  errorTitle: 'Invitation indisponible',
  errorNotFound: "Ce lien d'invitation est invalide, expiré ou déjà utilisé.",
  errorNetwork: 'Une erreur réseau est survenue. Réessaie.',
  errorAction: "L'action n'a pas pu être effectuée.",
  backHome: "Retour à l'accueil",
  rolePlayer: 'joueuse',
  roleSubstitute: 'remplaçante',
  roleCoach: 'coach',
  roleManager: 'manager',
  roleCaptain: 'capitaine',
});
