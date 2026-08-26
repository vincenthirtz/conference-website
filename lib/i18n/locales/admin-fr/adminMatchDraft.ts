// lib/i18n/locales/admin-fr/adminMatchDraft.ts
//
// Traductions FRANCAISES du namespace `adminMatchDraft` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminMatchDraft', {
  unavailableHeading: 'Draft indisponible',
  blockMatchNotFound: 'Ce match est introuvable dans ton tenant.',
  blockNoTournament:
    "Ce match n'est rattaché à aucun tournoi — impossible de résoudre le jeu.",
  blockNotDraftable:
    "Ce match n'a pas de jeu draftable{detail}. Le draft est uniquement disponible pour LoL et Dota 2.",
  blockNotDraftableDetail: ' (jeu actuel : {detail})',
});
