// lib/i18n/locales/fr/errorBoundary.ts
//
// Traductions FRANCAISES du namespace `errorBoundary` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('errorBoundary', {
  title: "Quelque chose s'est mal passé",
  body: 'Une erreur inattendue est survenue. Essaie de recharger la page.',
  retry: 'Réessayer',
});
