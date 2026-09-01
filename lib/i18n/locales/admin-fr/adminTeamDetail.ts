// lib/i18n/locales/admin-fr/adminTeamDetail.ts
//
// Traductions FRANCAISES du namespace `adminTeamDetail` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTeamDetail', {
  headTitle: 'Admin – Équipe',
  breadcrumbTeams: 'Équipes',
  breadcrumbTeam: 'Équipe',
  backToList: '← Retour à la liste des équipes',
  teamFallback: 'Équipe',
  overview: 'Vue d’ensemble de l’équipe et membres.',
  edit: 'Éditer',
  addMember: 'Ajouter un membre',
  errUnexpected: 'Erreur inattendue',
  loadingTeam: 'Chargement de l’équipe…',
  teamNotFound: 'Équipe introuvable.',
  informations: 'Informations',
  tagLabel: 'Tag : {tag}',
  statusLabel: 'Statut :',
  active: 'Active',
  inactive: 'Inactive',
  countryLabel: 'Pays',
  websiteLabel: 'Site web',
  twitterLabel: 'X',
  discordLabel: 'Discord',
  description: 'Description',
  members: 'Membres',
  loadingMembers: 'Chargement des membres…',
  noMembers: 'Aucun membre pour le moment.',
  captain: 'Capitaine',
  manager: 'Manager',
  battleTagVerified: '✓ vérifié',
  battleTagUnverified: 'non vérifié',
  battleTagVerifiedTitle: 'BattleTag vérifié via Battle.net le {date}',
  battleTagUnverifiedTitle: 'BattleTag non vérifié par OAuth Battle.net',
  battleTagMismatch: '⚠ compte vérifié ≠ tag roster',
  battleTagMismatchTitle:
    'Le compte Blizzard vérifié de la joueuse ne correspond pas au BattleTag du roster (usurpation potentielle ou faute de frappe à investiguer).',
  unverifiedCount: '{count} non vérifié(s)',
});
