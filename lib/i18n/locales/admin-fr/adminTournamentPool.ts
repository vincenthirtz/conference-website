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
    'Les équipes dont 5 membres se sont inscrites sont inscrites automatiquement. Ici, tu places le reste de la liste d’attente : noyaux d’une même équipe complétés, équipes mixtes formées pour la soirée. Une équipe joue à 5 et peut accueillir jusqu’à 3 remplaçantes pour les rotations. Les joueuses gardent toujours leur vraie équipe.',
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
  squadSubs: '{size} + {subs} remplaçante(s)',
  squadNoPool:
    'Inscrite hors inscription individuelle : ses joueuses n’apparaissent pas ici.',
  unplace: 'Remettre en attente',
  errTeamFull: 'Cette équipe est déjà pleine, remplaçantes comprises.',
  errNotWaiting:
    'Une des joueuses n’est plus en attente : la liste a été actualisée.',
  errGeneric: 'L’opération a échoué.',
  done: 'Répartition mise à jour.',

  // Gestion à la main : joueuses (ajout, correction, retrait) et équipes
  // (création, nom, suppression, déplacement).
  addTitle: 'Ajouter une joueuse',
  addHelp:
    'Pour une joueuse inscrite hors du formulaire (Discord, message…). Pas besoin de compte sur le site.',
  fieldName: 'Pseudo',
  fieldBattleTag: 'BattleTag',
  fieldOrigin: 'Équipe d’origine',
  addSubmit: 'Ajouter à la liste d’attente',
  manualChip: 'ajoutée à la main',
  edit: 'Modifier',
  save: 'Enregistrer',
  cancel: 'Annuler',
  withdraw: 'Retirer',
  withdrawConfirmTitle: 'Retirer {name} du tournoi ?',
  withdrawConfirmBody:
    'Elle quitte la liste d’attente ou son équipe. Tu pourras la remettre en attente depuis « Retirées ».',
  moveTo: 'Déplacer vers…',
  createTeamTitle: 'Créer une équipe vide',
  createTeamHelp:
    'Une équipe mixte inscrite sans joueuse : remplis-la ensuite depuis la liste d’attente.',
  teamNameLabel: 'Nom de l’équipe',
  createTeamSubmit: 'Créer l’équipe',
  rename: 'Renommer',
  dissolve: 'Supprimer l’équipe',
  dissolveConfirmTitle: 'Supprimer {team} du tournoi ?',
  dissolveConfirmBody:
    'Ses joueuses repartent en liste d’attente et l’équipe est retirée du tournoi. Une vraie équipe du site n’est pas supprimée : elle est seulement désinscrite.',
  dissolveLocked: 'A déjà des matchs : elle ne peut plus être supprimée.',
  withdrawnTitle: 'Retirées · {count}',
  restore: 'Remettre en attente',
  errInvalidTarget:
    'Cette équipe n’est pas inscrite à ce tournoi : la liste a été actualisée.',
  errHasMatches:
    'Cette équipe a déjà des matchs : elle ne peut pas être supprimée.',
  errNotMixed: 'Seule une équipe formée par le staff se renomme ici.',
  errNotActive:
    'Cette joueuse n’est plus inscrite : la liste a été actualisée.',
  errInvalidBody:
    'Vérifie les champs : pseudo de 2 à 40 caractères, BattleTag de 3 à 40, nom d’équipe de 2 à 60.',

  // Aperçu des inscrites (pages/admin/tournament/[id]/participants.tsx).
  overviewHeadTitle: 'Admin – Inscrites',
  overviewTitle: 'Aperçu des inscrites',
  overviewSubtitle:
    'Toutes les équipes inscrites avec leurs joueuses, la liste d’attente rangée par équipe d’origine et les joueuses inscrites seules. Lecture seule : la répartition se fait dans l’onglet Répartition.',
  overviewToPool: 'Ouvrir la répartition',
  overviewStatTeams: 'Équipes inscrites',
  overviewStatPlayers: 'Joueuses en équipe',
  overviewStatWaiting: 'En attente',
  overviewStatSolos: 'Seules, sans équipe',
  overviewTeamsTitle: 'Équipes inscrites',
  overviewTeamCount: '{count} / {size}',
  overviewFromRoster: 'effectif',
  overviewFromRosterHelp:
    'Inscrite directement : effectif de l’équipe, pas une inscription individuelle.',
  overviewNoPlayers: 'Aucune joueuse connue pour cette équipe.',
  overviewSubstitute: 'remplaçante',
  overviewWaitingTitle: 'En attente, avec leur équipe',
  overviewWaitingEmpty: 'Aucune joueuse en attente avec une équipe.',
  overviewWaitingCount: '{count} / {size} inscrites',
  overviewSolosTitle: 'Seules, sans équipe',
  overviewSolosEmpty: 'Aucune joueuse inscrite seule.',
  overviewSignedUpOn: 'inscrite le {date}',
});
