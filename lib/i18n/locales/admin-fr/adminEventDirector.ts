// lib/i18n/locales/admin-fr/adminEventDirector.ts
//
// Traductions FRANCAISES du namespace `adminEventDirector` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminEventDirector', {
  errorLoad: 'Erreur de chargement.',
  autoCueFailed: 'Auto-cue échoué ({status}).',
  startFailedStatus: 'Démarrage échoué ({status}).',
  runAlreadyLive: 'Le run était déjà en direct.',
  runStarted: 'Run démarré.',
  startFailed: 'Démarrage échoué.',
  confirmEndRunTitle: 'Terminer ce run ?',
  confirmEndRunSubtitle:
    'Tous les segments non terminés passeront en « done ». Cette action est irréversible.',
  confirmEndRunLabel: 'Terminer',
  endFailedStatus: 'Fin échouée ({status}).',
  runAlreadyEnded: 'Le run était déjà terminé.',
  runEnded: 'Run terminé.',
  endFailed: 'Fin échouée.',
  segmentAlreadyLive: 'Déjà en direct.',
  segmentStarted: 'Segment démarré.',
  confirmSkipTitle: 'Passer « {title} » ?',
  confirmSkipSubtitle:
    'Le segment sera marqué « passé » et ne sera pas joué. Action irréversible.',
  confirmSkipLabel: 'Passer',
  skipFailedStatus: 'Skip échoué ({status}).',
  segmentSkipped: 'Segment passé.',
  skipFailed: 'Skip échoué.',
  segmentEnded: 'Segment terminé.',
  confirmDeleteSegTitle: 'Supprimer « {title} » ?',
  confirmDeleteSegSubtitle: 'Le segment sera définitivement supprimé.',
  confirmDeleteLabel: 'Supprimer',
  deleteFailedStatus: 'Suppression échouée ({status}).',
  segmentDeleted: 'Segment supprimé.',
  deleteFailed: 'Suppression échouée.',
  reorderFailed: 'Reorder échoué, restauration.',
  reorderConflict:
    "L'ordre a été modifié par un autre régisseur — affichage réaligné.",
  errorRunNotFound: 'Run introuvable.',
  segmentAdded: 'Segment ajouté.',
  errorNoSegment: 'Aucun segment sélectionné.',
  segmentSaved: 'Segment sauvegardé.',
  assignmentUpdated: 'Assignation mise à jour.',
  waveCreated: 'Wave créée.',
  createFailed: 'Création échouée.',
  waveUpdated: 'Wave mise à jour.',
  updateFailed: 'Mise à jour échouée.',
  confirmSkipWaveTitle: 'Passer la wave « {title} » ?',
  confirmSkipWaveSubtitle: 'La wave sera marquée « passée ».',
  skipWaveLabel: 'Passer',
  waveStatusUpdated: 'Statut de la wave mis à jour.',
  statusChangeFailed: 'Changement échoué.',
  confirmDeleteWaveTitle: 'Supprimer la wave « {title} » ?',
  confirmDeleteWaveSubtitle:
    'Les segments rattachés ne seront pas supprimés mais détachés de la wave.',
  waveDeleted: 'Wave supprimée.',
  stationCreated: 'Station créée.',
  stationUpdated: 'Station mise à jour.',
  confirmDeleteStationTitle: 'Supprimer la station « {name} » ?',
  confirmDeleteStationSubtitle:
    'Les segments rattachés ne seront pas supprimés mais détachés de la station.',
  stationDeleted: 'Station supprimée.',
  pageTitleWithRun: 'Director – {name} · Run of show',
  pageTitleNoRun: 'Director – Run of show',
  breadcrumbAdmin: 'Admin',
  breadcrumbRunOfShow: 'Run of show',
  breadcrumbDirectorFallback: 'Director',
  loading: 'Chargement…',
  eventNotFound: 'Event introuvable.',
  timelineHeading: 'Timeline',
  dragToReorder: 'Glisse pour réordonner',
  editionHeading: 'Edition',
  castersHeading: 'Casters',
  commsHeading: 'Comms',
  wavesStationsHeading: 'Waves & Stations',
  conflictsHeading: 'Conflits de planning',
  conflictsSubtitle:
    'Une équipe est programmée sur des matchs qui se chevauchent. Vérifiez le planning avant le direct.',
  conflictLine: ': « {matchA} » chevauche « {matchB} »',
  conflictOverlap: 'chevauchement {start} – {end}',
  conflictUnknownTeam: 'Équipe inconnue',
  realtimeConnected: 'Temps réel',
  realtimeDegraded: 'Reconnexion… (mode dégradé)',
});
