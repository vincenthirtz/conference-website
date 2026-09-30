// lib/i18n/locales/admin-en/adminMvpOverlay.ts — miroir ANGLAIS.

export default {
  title: 'Crowd MVP poll',
  subtitle:
    'The “crowd favourite” vote (Twitch !mvp + Discord) shows in the Régie source. Set it up, test it on screen, then run it live match by match.',
  regieLive: 'Régie source on screen',
  regieOffline: 'Régie source not detected: open it in OBS to see the test',
  testTitle: 'Test on screen',
  testHint:
    'A fake animated vote ({seconds} s) shows in the Régie source, marked “TEST”. No vote is written; a real open vote always takes precedence.',
  testStart: 'Start the test',
  testRestart: 'Restart the test',
  testStop: 'Stop the test',
  testRunning: 'Test on screen — {seconds} s left',
  testStarted: 'Test started in the Régie source',
  testStopped: 'Test stopped',
  settingsTitle: 'Settings',
  windowLabel: 'Default vote duration (minutes)',
  positionLabel: 'Position on screen',
  positionTop: 'Top',
  positionCenter: 'Centre',
  positionBottom: 'Bottom',
  showSourcesLabel: 'Show the Twitch / Discord breakdown',
  save: 'Save',
  saved: 'Settings saved',
  readOnlySettings:
    'Settings are reserved to broadcast management; you can still test and run the vote.',
  liveTitle: 'Live',
  twitchReady:
    'Twitch chat: !mvp votes are counted automatically during the vote, no cockpit needed.',
  twitchMissingScope:
    'Twitch chat: reconnect the channel (Admin › Twitch) to allow reading the chat. Until then, only the cockpit and Discord count votes.',
  twitchNotConnected:
    'Twitch chat: no channel connected for this space — only Discord and the cockpit count votes.',
  twitchNotConfigured:
    'Twitch chat: EventSub not configured on the server — only Discord and the cockpit count votes.',
  noTournament: 'Pick a tournament above to run the vote of its matches.',
  errorLoad: 'Could not load the poll.',
  errorSave: 'Could not save.',
  errorTest: 'Could not run the test.',
};
