// lib/i18n/locales/admin-fr/adminDirectorTimelineBuilder.ts
//
// Traductions FRANCAISES du namespace `adminDirectorTimelineBuilder` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminDirectorTimelineBuilder', {
  emptyTitle: 'Aucun segment.',
  emptyDescription:
    'Ajoute un premier segment pour commencer a structurer ton run.',
  addSegment: 'Ajouter un segment',
  addSegmentPlus: '+ Ajouter un segment',
});
