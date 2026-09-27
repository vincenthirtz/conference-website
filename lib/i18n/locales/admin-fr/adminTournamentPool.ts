// lib/i18n/locales/admin-fr/adminTournamentPool.ts
//
// Traductions FRANCAISES du namespace `adminTournamentPool` — SOURCE DE VERITE.
// Écran de répartition de la liste d'attente d'un tournoi regroupé en équipes
// de 5 (pages/admin/tournament/[id]/pool.tsx). Le pendant anglais vit dans
// `../admin-en/adminTournamentPool.ts` ; le garde-fou `../admin-parity.ts`
// casse le typecheck si une clé manque.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentPool', {
  headTitle: 'Admin – Répartition des joueuses',
  title: 'Répartition des joueuses',
  subtitle:
    'Les équipes dont 5 membres se sont inscrites sont inscrites automatiquement. Ici, tu places le reste de la liste d’attente : noyaux d’une même équipe complétés, équipes mixtes formées pour la soirée. Les joueuses gardent toujours leur vraie équipe.',
  notPooled:
    'Ce tournoi n’utilise pas l’inscription individuelle regroupée. Active-la dans Réglages › Général.',
  loadError: 'Répartition indisponible.',
  loading: 'Chargement…',
  refresh: 'Actualiser',
  stats:
    '{teams} équipes inscrites · {placed} joueuses placées · {waiting} en attente',
  proposalTitle: 'Proposition',
  proposalHelp:
    'Calculée à partir de la liste d’attente : les plus gros noyaux d’abord, complétés par des joueuses sans équipe, puis par des joueuses d’autres noyaux. Valide équipe par équipe, ou place à la main ci-dessous.',
  proposalEmpty:
    'Aucune équipe complète ne peut être formée avec la liste d’attente actuelle.',
  proposalCore: 'Noyau {team} complété',
  proposalMixed: 'Équipe mixte',
  proposalMixedName: 'Nom de l’équipe mixte',
  proposalMixedDefault: 'Équipe {n}',
  proposalApply: 'Valider cette équipe',
  proposalLeftover:
    '{count} joueuse(s) resteraient en attente : pas assez pour une équipe complète.',
  waitlistTitle: 'Liste d’attente',
  waitlistEmpty: 'Personne en attente.',
  noTeam: 'Sans équipe',
  fromTeam: 'Équipe : {team}',
  manualTitle: 'Placer la sélection',
  manualSelected: '{count} sélectionnée(s)',
  manualTarget: 'Dans',
  manualNewTeam: 'Nouvelle équipe mixte…',
  manualNewTeamName: 'Nom de la nouvelle équipe',
  manualPlace: 'Placer',
  squadsTitle: 'Équipes inscrites',
  squadsEmpty: 'Aucune équipe inscrite pour l’instant.',
  squadMixed: 'mixte',
  squadIncomplete: 'Incomplète : {count} / {size}',
  squadNoPool:
    'Inscrite hors inscription individuelle : ses joueuses n’apparaissent pas ici.',
  unplace: 'Remettre en attente',
  errTeamFull: 'Cette équipe est déjà complète.',
  errNotWaiting:
    'Une des joueuses n’est plus en attente : la liste a été actualisée.',
  errGeneric: 'L’opération a échoué.',
  done: 'Répartition mise à jour.',
});
