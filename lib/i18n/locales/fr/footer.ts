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
  // Libellé volontairement distinct de « Rejoindre une équipe » (navbar,
  // espace joueuse) : le footer est rendu partout, y compris en admin, et un
  // second texte identique ferait deux correspondances là où un test en attend
  // une (tests/e2e/admin-player-view.spec.ts).
  joinTeam: 'Trouver une équipe',
  recruitPlayer: 'Recruter une joueuse',
  about: 'À propos',
  installApp: "Installer l'app",
  donate: 'Faire un don',
  support: 'Signalement / Support',
  organisers: 'Organiser un tournoi',
  // Le guide de la niche, listé À CÔTÉ de la page des offres et non à sa place :
  // « Organiser un tournoi » mène au produit (ouvert à tout organisateur, y
  // compris les circuits d'autres jeux) ; ce lien-ci mène au mode d'emploi
  // féminin et mixte. Renommer le premier aurait donné deux entrées au même
  // titre pour deux pages différentes.
  womenGuide: 'Guide : tournoi féminin ou mixte',
  contact: 'Nous contacter',
  legal: 'Mentions légales',
  terms: 'Conditions de vente',
  copyright: "Association WOMEN'S CUP — Tous droits réservés — Fait avec ❤️ par",
  // Bouton flottant « retour en haut » (components/Buttons/BackToTopButton) :
  // chrome global, comme le pied de page, dont le namespace est déjà chargé
  // sur toutes les pages.
  backToTop: 'Aller en haut',
});
