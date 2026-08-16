// lib/i18n/locales/fr/secretRevealCard.ts
//
// Traductions FRANCAISES du namespace `secretRevealCard` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('secretRevealCard', {
  copiedToast: '{label} copié dans le presse-papier.',
  copyError: 'Copie impossible : copiez le manuellement.',
  title: 'Notez ces secrets maintenant',
  subtitle:
    'Ils ne seront jamais affichés à nouveau. Conservez-les dans un gestionnaire de secrets ou directement dans la config de votre bot.',
  envSnippetLabel: 'Snippet .env',
  copy: 'Copier',
  copied: 'Copié !',
  copyBlock: 'Copier le bloc',
});
