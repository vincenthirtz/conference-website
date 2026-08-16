// lib/i18n/locales/fr/newsletterSignup.ts
//
// Traductions FRANCAISES du namespace `newsletterSignup` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('newsletterSignup', {
  footerTitle: 'Newsletter',
  footerDescription:
    'Reçois les temps forts, dates de tournois et annonces par email.',
  sectionTitle: 'Ne rate aucune annonce',
  sectionDescription:
    "Inscris-toi à la newsletter pour recevoir les dates des tournois, les temps forts et les nouveautés de l'OW Women's Cup, directement dans ta boîte mail.",
  emailLabel: 'Adresse email',
  emailPlaceholder: 'ton@email.com',
  captchaLabel: 'Anti-bot — combien font {question} ?',
  captchaPlaceholder: 'Réponds par un nombre',
  submit: "S'inscrire",
  submitting: 'Envoi…',
  successTitle: 'Presque terminé !',
  successBody: 'Vérifie ta boîte mail pour confirmer ton inscription.',
  errorEmail: 'Merci de saisir une adresse email valide.',
  errorGeneric: "L'inscription a échoué. Réessaie dans un instant.",
  honeypotLabel: 'Ne pas remplir',
  privacyNote:
    'Un seul email de confirmation. Désinscription possible à tout moment.',
});
