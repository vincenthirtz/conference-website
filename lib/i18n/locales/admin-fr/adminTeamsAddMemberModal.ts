// lib/i18n/locales/admin-fr/adminTeamsAddMemberModal.ts
//
// Traductions FRANCAISES du namespace `adminTeamsAddMemberModal` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTeamsAddMemberModal', {
  title: 'Ajouter un joueur',
  subtitle: 'Recherchez un membre existant ou saisissez ses informations',
  cancel: 'Annuler',
  adding: 'Ajout...',
  addPlayer: 'Ajouter le joueur',
  searchLabel: 'Rechercher un joueur existant',
  searchHint: 'Par email, nom ou BattleTag',
  searchPlaceholder: 'Tapez au moins 2 caractères...',
  noResults: 'Aucun résultat trouvé',
  playerFallback: 'Joueur',
  teamPrefix: 'Équipe: {name}',
  orManual: 'ou saisir manuellement',
  emailLabel: 'Email utilisateur',
  userIdLabel: 'Ou User ID',
  battleTagFormat: 'Format : Pseudo#0000',
  skillRatingLabel: 'Niveau Overwatch (SR) — facultatif',
  roleLabel: "Rôle dans l'équipe",
  statusLabel: 'Statut',
  captain: 'Capitaine',
  captainDesc: "Chef d'équipe",
  substitute: 'Remplaçant',
  substituteDesc: 'Joueur de réserve',
});
