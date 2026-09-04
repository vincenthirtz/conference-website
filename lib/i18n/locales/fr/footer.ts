// lib/i18n/locales/fr/footer.ts
//
// Traductions FRANCAISES du namespace `footer` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('footer', {
  tagline:
    'Le tournoi Overwatch 100 % féminin et francophone. Communauté, compétition, bienveillance.',
  colTournament: 'Tournoi',
  colCommunity: 'Communauté',
  colLegal: 'Légal & contact',
  leaderboard: 'Classement des joueuses',
  palmares: 'Palmarès',
  ambassadors: 'Ambassadeur·rices',
  rules: 'Règlement',
  news: 'Actualités OW',
  sitemap: 'Plan du site',
  about: 'À propos',
  installApp: "Installer l'app",
  donate: 'Faire un don',
  support: 'Signalement / Support',
  organisers: 'Organiser un tournoi',
  contact: 'Nous contacter',
  legal: 'Mentions légales',
  terms: 'Conditions de vente',
  copyright:
    "Association WOMEN'S CUP — Tous droits réservés — Fait avec ❤️ par",
});
