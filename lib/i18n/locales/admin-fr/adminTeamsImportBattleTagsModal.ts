// lib/i18n/locales/admin-fr/adminTeamsImportBattleTagsModal.ts
//
// Traductions FRANCAISES du namespace `adminTeamsImportBattleTagsModal` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTeamsImportBattleTagsModal', {
  title: 'Importer des BattleTags',
  subtitlePrefix: 'Une ligne par membre :',
  subtitleSuffix:
    "L'identifiant peut être un BattleTag actuel, un User ID ou un ID de membre.",
  toApply: '{count} à appliquer',
  cancel: 'Annuler',
  apply: 'Appliquer les BattleTags',
  textareaPlaceholder: 'Old#1234,New#5678\nuuid-du-membre,Pseudo#0001',
  preview: 'Prévisualiser',
  colIdentifiant: 'Identifiant',
  colStatut: 'Statut',
  emptyLine: 'Aucune ligne',
  statusMatched: 'Trouvé',
  statusInvalid: 'Format invalide',
  statusNotFound: 'Introuvable',
  statusEmpty: 'Ligne incomplète',
});
