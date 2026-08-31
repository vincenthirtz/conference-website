// lib/i18n/locales/admin-fr/adminTeamsEditMemberModal.ts
//
// Traductions FRANCAISES du namespace `adminTeamsEditMemberModal` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTeamsEditMemberModal', {
  title: 'Modifier le membre',
  cancel: 'Annuler',
  saving: 'Enregistrement...',
  save: 'Enregistrer',
  specialtyLabel: 'Poste',
  specialtyNone: 'Non déclaré',
  specialtyTank: 'Tank',
  specialtyDps: 'DPS',
  specialtySupport: 'Support',
  specialtyFlex: 'Flex',
  skillRatingLabel: 'Niveau Overwatch (SR)',
  skillRatingHint:
    'Entre 0 et 5000. Laisser vide pour effacer le niveau déclaré.',
  roleLabel: 'Rôle',
  substitute: 'Remplaçant',
});
