// lib/i18n/locales/admin-fr/adminMvpOverlay.ts
//
// Traductions FRANCAISES du namespace admin `adminMvpOverlay`.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` ; le garde-fou
// `../admin-parity.ts` casse le typecheck si une cle manque d'un cote.

import { adminNs } from '../../ns';

export default adminNs('adminMvpOverlay', {
  title: 'Sondage MVP du public',
  subtitle:
    'Le vote « coup de cœur du public » (Twitch !mvp + Discord) s’affiche dans la source Régie. Réglez-le, testez-le à l’écran, puis pilotez-le en direct match par match.',
  regieLive: 'Source Régie affichée',
  regieOffline:
    'Source Régie non détectée : ouvrez-la dans OBS pour voir le test',
  testTitle: 'Tester à l’écran',
  testHint:
    'Un faux vote animé ({seconds} s) apparaît dans la source Régie, marqué « TEST ». Aucune voix n’est écrite ; un vrai vote ouvert passe toujours devant.',
  testStart: 'Lancer le test',
  testRestart: 'Relancer le test',
  testStop: 'Arrêter le test',
  testRunning: 'Test à l’écran — encore {seconds} s',
  testStarted: 'Test lancé dans la source Régie',
  testStopped: 'Test arrêté',
  settingsTitle: 'Réglages',
  windowLabel: 'Durée du vote par défaut (minutes)',
  positionLabel: 'Position à l’écran',
  positionTop: 'En haut',
  positionCenter: 'Au centre',
  positionBottom: 'En bas',
  showSourcesLabel: 'Afficher le détail Twitch / Discord',
  save: 'Enregistrer',
  saved: 'Réglages enregistrés',
  readOnlySettings:
    'Réglages réservés à la gestion de la diffusion ; vous pouvez tester et piloter le vote.',
  liveTitle: 'En direct',
  twitchReady:
    'Chat Twitch : les !mvp sont comptés automatiquement pendant le vote, sans cockpit ouvert.',
  twitchMissingScope:
    'Chat Twitch : reconnectez la chaîne (Admin › Twitch) pour autoriser la lecture du chat. D’ici là, seuls le cockpit et Discord comptent les votes.',
  twitchNotConnected:
    'Chat Twitch : aucune chaîne connectée pour cet espace — seuls Discord et le cockpit comptent les votes.',
  twitchNotConfigured:
    'Chat Twitch : EventSub non configuré côté serveur — seuls Discord et le cockpit comptent les votes.',
  noTournament:
    'Choisissez un tournoi ci-dessus pour piloter le vote de ses matchs.',
  errorLoad: 'Impossible de charger le sondage.',
  errorSave: 'Enregistrement impossible.',
  errorTest: 'Test impossible.',
});
