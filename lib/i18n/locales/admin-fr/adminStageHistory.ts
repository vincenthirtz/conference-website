// lib/i18n/locales/admin-fr/adminStageHistory.ts
//
// Traductions FRANCAISES du namespace `adminStageHistory` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminStageHistory', {
  errLoadHistory: 'Impossible de charger l’historique',
  errUnknown: 'Erreur inconnue',
  pageTitle: 'Admin – Historique de la phase',
  back: '← Retour à la phase',
  heading: 'Historique staff de la phase',
  subtitle:
    'Journal des actions staff liées à cette phase (stages, matches, etc.).',
  entityTypeLabel: "Type d'entité (entity_type)",
  entityTypePlaceholder: 'ex: "stage", "match", "team"...',
  actionLabel: 'Action',
  actionPlaceholder: 'ex: "create_match", "update_stage"...',
  limitLabel: 'Limite',
  filter: 'Filtrer',
  loading: 'Chargement...',
  logsCount: 'Logs ({count})',
  sortedHint: 'Trié du plus récent au plus ancien',
  emptyLogs: 'Aucun log trouvé pour ces filtres.',
  by: 'par',
  payloadDetails: 'Détails (payload)',
  openMatch: 'Ouvrir le match',
  openStage: 'Ouvrir la phase',
  openTeam: "Ouvrir l'équipe",
  openTournament: 'Ouvrir le tournoi',
  // Onglets de la page + snapshots de bracket
  tabJournal: 'Journal',
  tabSnapshots: 'Snapshots',
  snapHeading: 'Snapshots du bracket',
  snapIntro:
    'Photographie des scores, statuts et vainqueurs de tous les matchs de la phase. Restaurer remet les matchs dans cet état ; un snapshot « avant restauration » est pris automatiquement juste avant.',
  snapReasonLabel: 'Motif (facultatif)',
  snapReasonPlaceholder: 'ex : avant correction du round 2',
  snapTake: 'Prendre un snapshot',
  snapTaking: 'Snapshot…',
  snapTaken: 'Snapshot pris ({count} match(s)).',
  snapErrTake: 'Échec de la création du snapshot.',
  snapErrLoad: 'Impossible de charger les snapshots.',
  snapEmpty: 'Aucun snapshot pour cette phase.',
  snapCount: '{count} snapshot(s)',
  snapMatches: '{count} match(s)',
  snapRestore: 'Restaurer',
  snapRestoreAdminOnly: 'Réservé aux admins',
  snapRestoreTitle: 'Restaurer ce snapshot ?',
  snapRestoreSubtitle:
    'Les scores, statuts et vainqueurs des matchs reviendront à leur état du {date}. Tout ce qui a été saisi depuis sera écrasé (un snapshot « avant restauration » permet d’annuler).',
  snapRestoreConfirm: 'Restaurer',
  snapRestored:
    'Snapshot restauré : {restored} match(s) remis, {missing} introuvable(s).',
  snapErrRestore: 'Échec de la restauration.',
  snapReasonManual: 'Manuel',
  snapReasonPreRestore: 'Avant restauration',
  snapReasonApplyScore: 'Saisie de score',
  snapReasonAutoSeed: 'Seeding automatique',
  snapReasonManualSeed: 'Seeding manuel',
  snapReasonAdvance: 'Avancement des équipes',
  snapReasonPropagation: 'Propagation du bracket',
});
