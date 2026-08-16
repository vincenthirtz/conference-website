// lib/i18n/locales/admin-fr/adminStageNav.ts
//
// Traductions FRANCAISES du namespace `adminStageNav` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminStageNav', {
  ariaLabel: 'Navigation de la phase',
  backTournaments: '← Tournois',
  backTournamentFallback: 'Tournoi',
  tabOverview: 'Aperçu',
  tabTeams: 'Équipes',
  tabSeeding: 'Seeding',
  tabGroups: 'Groupes',
  tabSwiss: 'Swiss',
  tabHistory: 'Historique',
});
