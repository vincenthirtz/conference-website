// lib/i18n/locales/fr/patchNotesSection.ts
//
// Traductions FRANCAISES du namespace `patchNotesSection` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('patchNotesSection', {
  errLoad: 'Impossible de charger les patch notes pour le moment.',
  unavailable:
    "Impossible d'afficher les dernières notes de mise à jour pour l'instant.",
  checkOfficial: 'Consultez-les directement sur le site officiel.',
  seePatchNotes: 'Voir les patch notes',
  patchNotesLabel: 'Patch notes',
  readOn: 'Lire sur overwatch.blizzard.com',
  eyebrow: 'Actualités',
  title: 'Patch notes Overwatch',
  subtitle:
    "Les dernières mises à jour officielles d'Overwatch, à jour directement depuis le site de Blizzard.",
  seeMore: 'Voir plus',
  categoryFallback: 'Autres mises à jour',
});
