// lib/i18n/locales/admin-fr/adminTeamsMembersSection.ts
//
// Traductions FRANCAISES du namespace `adminTeamsMembersSection` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTeamsMembersSection', {
  membersTitle: 'Membres ({count})',
  cancelSwap: "Annuler l'échange",
  importBattleTags: 'Importer BattleTags',
  add: 'Ajouter',
  selectToSwap: 'Sélectionnez un membre pour échanger avec',
  selectedCount: '{count} sélectionné(s)',
  selectAll: 'Tout sélectionner',
  rolePlaceholder: 'Rôle…',
  apply: 'Appliquer',
  markSub: 'Marquer remplaçant',
  unmarkSub: 'Retirer remplaçant',
  removeFromTeam: "Retirer de l'équipe",
  deselect: 'Désélectionner',
  captainProtected:
    'Le capitaine est protégé : il ne sera ni retiré ni passé remplaçant.',
  loading: 'Chargement...',
  emptyTeam: 'Aucun membre dans cette équipe',
  rosterTitle: 'Roster ({count})',
  noActivePlayer: 'Aucun joueur actif',
  subsTitle: 'Remplaçants ({count})',
  noSub: 'Aucun remplaçant',
  staffTitle: "Staff de l'équipe ({count})",
  noStaff: 'Aucun coach ni manager',
});
