// lib/i18n/locales/en/teamMemory.ts
//
// Traductions ANGLAISES du namespace `teamMemory`.
//
// La SOURCE DE VERITE est le francais (`../fr/teamMemory.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Team memory',
  subtitle:
    'What you took away from each encounter. Visible to your team only, never to the opponent.',
  reviewedCount: '{reviewed} of {total} reviewed',
  filterLabel: 'Opponent',
  filterAll: 'All opponents',
  unknownOpponent: 'Unknown opponent',
  typeMatch: 'Match',
  typeScrim: 'Scrim',
  badgeReviewed: 'Reviewed',
  badgeTodo: 'To review',
  win: 'Win',
  loss: 'Loss',
  write: 'Write',
  edit: 'Edit',
  close: 'Close',
  vodLabel: 'VOD link',
  vodPlaceholder: 'https://…',
  notesLabel: 'Review notes',
  notesPlaceholder:
    'What worked, what did not, what to drill before the next one…',
  privacy:
    'These notes stay inside your team: neither the opponent, nor staff, nor any public page can read them.',
  saveCta: 'Save',
  saving: 'Saving…',
  saved: 'Review saved.',
  saveError: 'Could not save the review.',
  deleteCta: 'Delete review',
  deleted: 'Review deleted.',
  watchVod: 'Watch the VOD',
  objectivesLabel: 'Goals:',
  notesFromObjectives: 'Goals set:\n{objectives}\n\nWhat we take from it:\n',
};
