// lib/i18n/locales/admin-fr/adminTeamsMemberRow.ts
//
// Traductions FRANCAISES du namespace `adminTeamsMemberRow` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTeamsMemberRow', {
  memberFallback: 'Membre',
  captain: 'Capitaine',
  substitute: 'Remplaçant',
  swapWithSubTitle: 'Échanger avec un remplaçant',
  swapWithRosterTitle: 'Échanger avec un joueur du roster',
  setCaptainTitle: 'Définir comme capitaine',
  editTitle: 'Modifier',
  deleteTitle: 'Supprimer',
  clickToSwap: 'Cliquer pour échanger',
  battleTagVerified: '✓ vérifié',
  battleTagUnverified: 'non vérifié',
  battleTagVerifiedTitle: 'BattleTag vérifié via Battle.net le {date}',
  battleTagUnverifiedTitle: 'BattleTag non vérifié par OAuth Battle.net',
  battleTagMismatch: '⚠ compte vérifié ≠ tag roster',
  battleTagMismatchTitle:
    'Le compte Blizzard vérifié de la joueuse ne correspond pas au BattleTag du roster (usurpation potentielle ou faute de frappe à investiguer).',
});
