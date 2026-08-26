// lib/i18n/locales/fr/contactForm.ts
//
// Traductions FRANCAISES du namespace `contactForm` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('contactForm', {
  intro:
    "Une question sur l'OW Women's Cup ? Laisse-nous un message, on répond vite.",
  sent: 'Message envoyé avec succès.',
  nameLabel: 'Nom',
  namePlaceholder: 'Ana Dupont',
  emailLabel: 'Email',
  emailPlaceholder: 'ana@email.com',
  subjectLabel: 'Sujet',
  subjectPlaceholder: 'Choisir un sujet',
  subjectCast: 'Rejoindre le cast / desk',
  subjectTournament: 'Infos tournoi / règles',
  subjectTeams: 'Inscription équipe',
  subjectPartner: 'Partenariat / sponsor',
  subjectOther: 'Autre question',
  messageLabel: 'Message',
  messagePlaceholder: 'Ton message…',
  consent:
    "J'accepte que mes informations soient utilisées pour traiter ma demande. (Pas de revente.)",
  submitting: 'Envoi…',
  submit: 'Envoyer',
  successInline: 'Merci ! Ton message a bien été envoyé 🎉',
  errorGeneric: 'Une erreur est survenue. Réessaie plus tard.',
  errorNetwork: 'Impossible de joindre le service. Vérifie ta connexion.',
});
