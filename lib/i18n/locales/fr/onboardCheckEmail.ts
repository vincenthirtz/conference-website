// lib/i18n/locales/fr/onboardCheckEmail.ts
//
// Traductions FRANCAISES du namespace `onboardCheckEmail` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('onboardCheckEmail', {
  title: 'Email envoyé',
  step: 'Étape 2/3 — Confirmation par email',
  body: "Cliquez sur le lien dans l'email que nous venons d'envoyer pour confirmer votre demande. Le lien est valable pour une seule utilisation.",
  spamNote:
    'Pensez à vérifier vos courriers indésirables si vous ne le voyez pas après quelques minutes.',
  unreachable: 'Identifiant de demande manquant ou invalide.',
  restart: 'Recommencer la demande',
  polling:
    'On surveille la confirmation en arrière-plan — vous serez redirigé·e automatiquement dès clic sur le lien.',
  lostEmailTitle: "Vous avez perdu l'email ?",
  lostEmailBody:
    "Le renvoi automatique n'est pas encore disponible. Pour récupérer un nouveau lien, contactez le staff sur",
  ourDiscord: 'notre Discord',
  backToIntro: '← Retour à la présentation',
});
