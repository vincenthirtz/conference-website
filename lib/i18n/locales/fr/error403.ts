// lib/i18n/locales/fr/error403.ts
//
// Traductions FRANCAISES du namespace `error403` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('error403', {
  pageTitle: "Accès refusé | OW Women's Cup",
  heading: 'Accès refusé',
  body: "Tu n'as pas les permissions nécessaires pour accéder à cette page. Si tu penses qu'il s'agit d'une erreur, contacte l'équipe.",
  backHome: "Retour à l'accueil",
  signIn: 'Se connecter',
  needHelp: "Besoin d'aide ?",
});
