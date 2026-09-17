// lib/i18n/locales/fr/overlay.ts
//
// Traductions FRANCAISES du namespace `overlay` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('overlay', {
  docTitle: 'Overlay de diffusion',
  invalidRunId: 'Identifiant de run invalide.',
  connecting: 'Connexion à la régie…',
  live: 'Live',
  camera: 'Caméra',
  sponsors: 'Partenaires',
  vs: 'VS',
  winner: 'Vainqueur',
  logoAlt: 'Logo {name}',
  brandFallback: 'La compétition',
  startingEyebrow: 'Bientôt en direct',
  startingTitle: 'Le stream va commencer',
  startingSubtitle: 'Installez-vous, ça arrive.',
  pauseEyebrow: 'Intermission',
  pauseTitle: 'Pause',
  pauseSubtitle: 'On revient dans un instant.',
  endEyebrow: "C'est terminé",
  endTitle: "Merci d'avoir suivi",
  customEyebrow: 'En direct',
  resultTitle: 'Résultat',
  resultWithFormat: 'Résultat · {format}',
  resultNoMatchTitle: 'Fin du match',

  // Sources de stream PAR MATCH (`/overlay/match/*`) — cf. la capacité de plan
  // `matchOverlays`. Vocabulaire volontairement court : ces libellés sont lus à
  // l'écran, en diagonale, par-dessus une vidéo.
  matchDocTitle: 'Source de stream — match',
  matchMissingTournament:
    'Ajoutez ?tournament=<identifiant ou slug> à l’URL pour suivre le match du moment.',
  matchWaitingTitle: 'Le direct reprend bientôt',
  matchWaitingSubtitle: 'La prochaine rencontre arrive.',
  matchNothingScheduled: 'Aucune rencontre à afficher pour l’instant.',
  matchPhaseUpcoming: 'À venir',
  matchPhaseLive: 'En direct',
  matchPhaseFinal: 'Terminé',
  matchCountdownLabel: 'Coup d’envoi dans',
  matchCountdownNow: 'Coup d’envoi',
  matchCountdownNoTime: 'Horaire à confirmer',
  matchCountdownDays: '{days} j {time}',
  matchScheduledAt: 'Coup d’envoi à {time}',
  matchMapsTitle: 'Maps',
  matchVetoTitle: 'Veto',
  matchMapBanned: 'Bannie',
  matchMapPicked: 'Choisie',
  matchMapDecider: 'Belle',
  matchTeamFallback: 'Équipe',

  // Source « matchs du jour » (`/overlay/day`).
  dayDocTitle: 'Source de stream — matchs du jour',
  dayEyebrow: 'Matchs du jour',
  dayEmpty: 'Aucun match programmé ce jour-là.',
  dayMissingTournament:
    'Ajoutez ?tournament=<identifiant ou slug> à l’URL pour afficher les matchs du jour.',
  dayTeamTbd: 'À déterminer',
  dayShownOf: '{shown} matchs affichés sur {total}',

  // Source « scrims à venir » (`/overlay/scrims`).
  scrimsDocTitle: 'Source de stream — scrims à venir',
  scrimsDateTbd: 'Date à fixer',

  // Source « faire un don » (`/overlay/don`).
  donDocTitle: 'Source de stream — faire un don',
  donEyebrow: 'Faire un don',
  donTitle: 'Soutenez l’association',
  donBody: 'Scannez le QR code pour faire un don via HelloAsso.',
  donQrAlt: 'QR code de don HelloAsso',
});
