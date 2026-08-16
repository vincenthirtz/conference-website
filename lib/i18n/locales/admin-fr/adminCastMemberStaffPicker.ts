// lib/i18n/locales/admin-fr/adminCastMemberStaffPicker.ts
//
// Traductions FRANCAISES du namespace `adminCastMemberStaffPicker` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminCastMemberStaffPicker', {
  loadError: 'Erreur de chargement.',
  label: 'Compte staff caster lié',
  none: '— Aucun (fiche publique seule) —',
  loading: 'Chargement des casters…',
  errorPrefix: 'Erreur : {error}',
  hint: 'Seuls les comptes staff avec le rôle "caster" peuvent être liés. Un caster ne peut être rattaché qu\'à une seule fiche.',
});
