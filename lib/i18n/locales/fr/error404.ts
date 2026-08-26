// lib/i18n/locales/fr/error404.ts
//
// Traductions FRANCAISES du namespace `error404` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('error404', {
  pageTitle: "Page introuvable | OW Women's Cup",
  metaDescription: "La page que tu cherches n'existe pas ou a été déplacée.",
  heading: 'Cette page a quitté la partie',
  body: "Le lien est peut-être cassé, la page a été déplacée, ou tu as trouvé un easter egg. Pas de panique, on t'aide à rentrer au lobby.",
  backHome: "Retour à l'accueil",
  previousPage: 'Page précédente',
  explore: 'Ou explore par ici',
  sHome: 'Accueil',
  sTournament: 'Tournoi',
  sAmbassadors: 'Ambassadeur·rices',
  sNews: 'Actualités',
  sSitemap: 'Plan du site',
  sContact: 'Contact',
  reportPrefix: 'Tu pensais voir autre chose ?',
  reportLink: 'Signale-le nous',
});
