// lib/i18n/locales/en/scouting.ts
//
// Traductions ANGLAISES du namespace `scouting`.
//
// La SOURCE DE VERITE est le francais (`../fr/scouting.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Opponent dossier',
  pageTitle: 'Dossier: {team}',
  subtitle:
    'Everything here derives from games already played. Nothing private from the opponent — only your own notes are.',
  backToDirectory: '← Back to the directory',
  loading: 'Loading the dossier…',
  errorLoad: 'Dossier unavailable.',
  retry: 'Try again',
  viewProfile: 'View public profile',
  rating: 'Rating {rating}',
  responseRate: '{rate}% response rate',
  headToHead: 'Head to head',
  headToHeadSummary: '{played} encounter(s): {wins} win(s), {losses} loss(es).',
  neverPlayed: 'You have never faced each other.',
  typeMatch: 'Match',
  typeScrim: 'Scrim',
  win: 'Win',
  loss: 'Loss',
  draw: 'Draw',
  form: 'Recent form',
  recordSummary:
    '{played} encounter(s) played: {wins} win(s), {losses} loss(es).',
  notEnoughData: 'Not enough encounters yet to read anything into it.',
  commonOpponents: 'Common opponents',
  commonOpponentsHint:
    'A crossed result places a team better than a rating does.',
  commonOpponentLine:
    'you {myWins}-{myLosses} · them {theirWins}-{theirLosses}',
  usualSlots: 'Usual slots',
  usualSlotsHint:
    'Derived from hours actually played, not from any declared availability. Times in {timezone}.',
  myNotes: 'Your notes on this team',
  myNotesHint:
    'Your match and scrim reviews against them. Private: nobody else sees them.',
  watchVod: 'Watch the VOD',
};
