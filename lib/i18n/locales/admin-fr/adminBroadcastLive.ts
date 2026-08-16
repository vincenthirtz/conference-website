// lib/i18n/locales/admin-fr/adminBroadcastLive.ts
//
// Traductions FRANCAISES du namespace `adminBroadcastLive` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminBroadcastLive', {
  pageTitle: 'Admin – Broadcast live',
  heading: 'Broadcast live',
  subtitle:
    'Cockpit unifié : segment en cours, casters, stream, overlays. Poll {seconds}s.',
  director: 'Director ↗',
  refresh: 'Rafraîchir',
  errorLoad: 'Erreur de chargement',
  loading: 'Chargement…',
  noRunPrefix: 'Aucun event_run en statut',
  noRunSuffix: 'pour ce tenant. Démarre un run via le Director.',
  onAir: 'On-air',
  live: '🔴 LIVE',
  off: 'OFF',
  runLabel: 'Run :',
  segmentHeading: 'Segment en cours',
  segmentType: 'Type {type} · {min} min prévues',
  segmentNone: 'Pas de segment live (transition ou pause).',
  matchHeading: 'Match',
  stream: 'Stream ↗',
  noStream: 'Pas de stream URL',
  segmentNonMatch: 'Segment non-match',
  castersHeading: 'Casters assignées',
  castersEmpty: 'Aucune caster sur ce match.',
  casterNoName: '— sans nom —',
  overlaysHeading: 'Overlays',
  goOffAir: 'Passer OFF AIR',
  goOnAir: 'Passer ON AIR',
  pipEnabled: 'PiP activé',
  lowerThirdLabel: 'Lower-third (texte affiché bas écran)',
  lowerThirdPlaceholder: 'Ex: Demi-finale — Alpha vs Bravo',
  push: 'Pousser',
  clear: 'Vider',
  currentOnScreen: "Actuel à l'écran :",
  readOnly:
    "Mode lecture seule (rôle caster). Demande à un manager pour toucher l'état.",
  stateUpdated: 'État mis à jour.',
  autoHeading: 'Automatisation régie',
  autoDirectorLabel: 'Régie automatique',
  autoDirectorOnHint:
    'Activée : les scènes changent seules sur les événements match (match lancé → scène « Match », match terminé → « Résultats »).',
  autoDirectorOffHint:
    "Désactivée : c'est toi qui pilotes les scènes à la main ci-dessous.",
  sceneLabel: 'Scène active',
  sceneStarting: 'Bientôt',
  sceneMatch: 'Match',
  scenePause: 'Pause',
  sceneResults: 'Résultats',
  sceneEnd: 'Fin',
  sceneCustom: 'Custom',
  sceneHint:
    "Un choix manuel reste affiché jusqu'au prochain événement automatique ou à un nouveau choix manuel.",
  nextMatch: 'Passer au prochain match',
  nextMatchLoading: 'Passage en cours…',
  nextMatchHint:
    'Avance le run live au prochain segment de type match et remet la scène sur « Bientôt ».',
  nextMatchSuccess: 'Match en direct : {title}',
  nextMatchAlready: 'Déjà en cours : {title}',
  nextMatchNoLiveRun: 'Aucun run en direct.',
  nextMatchNoCurrentSegment: 'Aucun segment courant sur le run.',
  nextMatchNoNextMatch: 'Aucun match suivant dans la timeline.',
  nextMatchSegmentNotUpcoming:
    "Le segment n'est plus à venir (déjà démarré ou terminé). Rafraîchis.",
  overlayUrlHeading: 'Overlay OBS',
  overlayUrlHint: 'Ajoute cette URL comme Source Navigateur dans OBS.',
  overlayCopy: 'Copier',
  overlayCopied: 'URL overlay copiée.',
  overlayCopyFailed: "Impossible de copier l'URL.",
  confirmNextTitle: 'Terminer {current} et passer à {next} ?',
  confirmNextTitleNoTarget: 'Terminer {current} et clore le run ?',
  confirmNextSubtitle:
    "Le segment en direct sera clôturé (irréversible) et le prochain match passera à l'antenne.",
  confirmNextSubtitleNoTarget:
    "Le segment en direct sera clôturé (irréversible). Aucun match suivant n'est identifié dans la timeline.",
  confirmNextLabel: 'Passer au match',
  realtimeConnected: 'Temps réel',
  realtimeDegraded: 'Reconnexion… (mode dégradé)',
  failure: 'Échec',
  twitchHeading: 'Statut Twitch',
  twitchLoading: 'Chargement du statut Twitch…',
  twitchLive: '🔴 LIVE',
  twitchOffline: 'Hors ligne',
  twitchViewers: '{count} spectateurs',
  twitchNotConfigured: 'Twitch non configuré.',
  twitchCollapse: 'Replier',
  twitchExpand: 'Déplier',
  twitchPreviewTitle: 'Aperçu Twitch de {channel}',
  twitchChatTitle: 'Chat Twitch de {channel}',
  twitchOfflinePlayer: 'Hors ligne — aucun aperçu disponible.',
});
