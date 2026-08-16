// lib/i18n/locales/fr/battlenetLogin.ts
//
// Traductions FRANCAISES du namespace `battlenetLogin` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('battlenetLogin', {
  pageTitle: "Connexion Battle.net – OW Women's Cup",
  heading: 'Connexion en cours',
  intro: "On valide ta connexion Battle.net et on t'emmène dans ton espace.",
  loadingSession: 'Vérification du lien…',
  redirecting: 'Connectée ! Redirection…',
  errorInvalidLink: 'Ce lien de connexion est invalide ou a expiré.',
  errorNoSession:
    "Impossible d'établir la session. Reprends depuis la page de connexion.",
  singleUseNote: 'Ce lien est à usage unique et expire rapidement.',
  backToLogin: 'Retour à la connexion',
});
