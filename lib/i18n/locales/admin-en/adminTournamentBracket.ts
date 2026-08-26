// lib/i18n/locales/admin-en/adminTournamentBracket.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentBracket`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentBracket.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin · Bracket',
  breadcrumbTournaments: 'Tournaments',
  breadcrumbTournament: 'Tournament {id}',
  breadcrumbBracket: 'Bracket',
  back: '← Back to tournament',
  eyebrow: 'Admin · Bracket',
  title: 'Tournament {id}',
  openBuilder: 'Open the bracket builder',
  viewMatches: 'View matches',
  loading: 'Loading...',
  createHeading: 'Create a new bracket',
  createDesc:
    'Generates the bracket structure without teams. Slots can be filled in later.',
  bracketTypeLabel: 'Bracket type',
  singleElim: 'Single Elimination',
  doubleElim: 'Double Elimination',
  slotsLabel: 'Number of slots (teams)',
  roundsSummary: '{rounds} rounds, {matches} matches total',
  defaultFormatLabel: 'Default format',
  firstMatchLabel: 'Date and time of the first match',
  firstMatchHelp: 'Optional. Times can also be changed in the bracket builder.',
  intervalLabel: 'Interval between matches (minutes)',
  grandFinalReset: 'Grand Final Reset',
  grandFinalResetHelp:
    'If the player coming from the Loser Bracket wins the Grand Final, an extra match is played to break the tie.',
  structurePreview: 'Structure preview',
  winnersBracket: 'Winners Bracket',
  losersBracket: 'Losers Bracket',
  roundFinal: 'Final',
  roundSemi: 'Semis',
  roundQuarter: 'Quarters',
  generating: 'Generating...',
  generateBtn: 'Generate the bracket ({matches} matches)',
  existsNotice:
    'A bracket already exists for this tournament. Use the bracket builder to change slots, dates, and results.',
  confirmTitleDouble: 'Generate a {size}-slot Double Elimination bracket?',
  confirmTitleSingle: 'Generate a {size}-slot Single Elimination bracket?',
  confirmSubtitle: '{count} matches in {format} format{reset}.',
  confirmResetSuffix: ', with grand-final reset',
  confirmLabel: 'Generate',
  errorGenerate: 'Error during generation',
  toastCreated: 'Bracket created with {count} matches. Redirecting...',
  errorUnknown: 'Unknown error',
};
