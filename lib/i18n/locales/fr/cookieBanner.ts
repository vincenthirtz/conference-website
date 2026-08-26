// lib/i18n/locales/fr/cookieBanner.ts
//
// Traductions FRANCAISES du namespace `cookieBanner` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('cookieBanner', {
  title: 'Gestion des cookies',
  description:
    'Nous utilisons des cookies pour assurer le bon fonctionnement du site et améliorer votre expérience. Vous pouvez personnaliser vos préférences ci-dessous.',
  essentialName: 'Cookies essentiels',
  essentialDesc:
    'Nécessaires au fonctionnement du site (authentification, sécurité). Ces cookies ne peuvent pas être désactivés.',
  functionalName: 'Cookies fonctionnels',
  functionalDesc:
    'Améliorent votre expérience (préférences, personnalisation).',
  analyticsName: 'Cookies analytiques',
  analyticsDesc:
    "Nous aident à comprendre comment vous utilisez le site pour l'améliorer.",
  marketingName: 'Cookies marketing',
  marketingDesc: 'Utilisés pour afficher des publicités pertinentes.',
  required: 'Requis',
  customize: 'Personnaliser',
  hideDetails: 'Masquer les détails',
  saveChoices: 'Enregistrer mes choix',
  refuse: 'Refuser',
  acceptAll: 'Tout accepter',
  legalPrefix: 'En savoir plus dans notre',
  privacyPolicy: 'politique de confidentialité',
  manage: 'Gérer les cookies',
  manageAria: 'Gérer les préférences de cookies',
});
