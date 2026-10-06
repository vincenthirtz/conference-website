// lib/i18n/locales/admin-en/adminTournamentReviews.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentReviews`.
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentReviews.ts`).
// Ne PAS annoter `as const` (cf. `../admin-parity.ts`).

export default {
  title: 'Reviews (YouTube)',
  label: 'YouTube reviews playlist',
  placeholder: 'https://www.youtube.com/playlist?list=PL…',
  help: 'Paste the playlist URL or its ID. The public “Reviews” tab only shows when a playlist is set. Leave empty to hide it.',
  invalid:
    'This is not a valid YouTube playlist: use a URL containing “list=…” or a full playlist ID.',
  save: 'Save playlist',
  saving: 'Saving…',
  saved: 'Reviews playlist saved.',
  cleared: 'Playlist removed: the Reviews tab is hidden.',
  errorSave: 'Could not save the playlist.',
  errorLoad: 'Could not read the current playlist.',
  migrationMissing:
    'Setting unavailable: the “tournaments_reviews_playlist” migration has not been applied yet.',
  current: 'Current playlist:',
  openOnYoutube: 'Open on YouTube',
  publicDelay:
    'The public page updates within about a minute (videos: up to an hour).',
};
