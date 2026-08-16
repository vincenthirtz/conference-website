// lib/i18n/locales/admin-fr/adminTournamentBulkOps.ts
//
// Traductions FRANCAISES du namespace `adminTournamentBulkOps` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentBulkOps', {
  headTitle: 'Admin · Opérations groupées',
  breadcrumbTournaments: 'Tournois',
  defaultTournamentName: 'Tournoi',
  breadcrumbBulkOps: 'Opérations groupées',
  eyebrow: 'Admin · Bulk',
  pageTitle: 'Opérations groupées',
  pageSubtitle: 'Décale un round entier ou déplace des matchs entre phases.',
  backToMatches: '← Liste des matchs',
  loading: 'Chargement…',
  shiftTitle: 'Décaler un round',
  shiftDesc:
    'Applique un offset (en minutes) à tous les matchs planifiés du round sélectionné. Les matchs sans horaire ou annulés sont ignorés.',
  stageLabel: 'Phase',
  selectPlaceholder: '— Sélectionner —',
  roundLabel: 'Round',
  roundOption: 'Round {n} ({count} match)',
  offsetLabel: 'Offset en minutes (négatif = avancer)',
  shifting: 'Décalage…',
  applyShift: 'Appliquer le décalage',
  reassignTitle: 'Réassigner des matchs vers une autre phase',
  reassignDesc:
    'Les matchs avec liens bracket actifs ou en dispute sont rejetés. Le group_key est réinitialisé après le déplacement.',
  sourceStageLabel: 'Phase source',
  targetStageLabel: 'Phase cible',
  matchesSelectedSummary: '{count} match(s) — {selected} sélectionné(s)',
  selectAll: 'Tout sélectionner',
  selectNone: 'Tout désélectionner',
  emptyStageMatches: 'Aucun match dans cette phase.',
  targetSummary: 'Cible : {name}',
  moving: 'Déplacement…',
  moveButton: 'Déplacer {count} match(s)',
  errorLoad: 'Erreur chargement',
  errorGeneric: 'Erreur',
  toastSelectRound: 'Sélectionne un round',
  toastInvalidOffset: 'Offset invalide (entier ≠ 0)',
  confirmShift:
    'Décaler ce round de {offset} minutes ? Les matchs sans horaire seront ignorés.',
  toastShifted: '{shifted} match(s) décalés ({ignored} ignorés)',
  toastSelectTarget: 'Sélectionne une phase cible',
  toastSelectAtLeastOne: 'Sélectionne au moins un match',
  toastSameStage: 'La phase source et cible doivent être différentes',
  confirmReassign:
    'Déplacer {count} match(s) vers la phase cible ? Le group_key sera réinitialisé.',
  toastMoved: '{count} match(s) déplacés',
  toastMovedSkipped: '. Ignorés: {reasons}',
});
