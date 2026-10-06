// lib/i18n/locales/en/teamOpening.ts
//
// Traductions ANGLAISES du namespace `teamOpening`.
//
// La SOURCE DE VERITE est le francais (`../fr/teamOpening.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais.

export default {
  title: 'Recruitment post',
  intro:
    'Tell players what your team is looking for. The post shows up on the Recruitment page and in the team directory, linked to your team.',
  none: 'No post published yet.',
  since: 'Published on {date}',
  expires: 'Visible until {date}',
  expired:
    'This post has expired and is no longer visible. Update it to put it back online for 60 days.',
  rolesLabel: 'Roles wanted',
  levelLabel: 'Team level',
  availabilityLabel: 'Availability (optional)',
  availabilityPlaceholder: 'e.g. Tuesday and Thursday, 9–11pm',
  noteLabel: 'Message to players (optional)',
  notePlaceholder: 'Vibe, goals, what you expect…',
  discordLabel: 'Discord handle for contact (optional)',
  contactNotice: 'Contact shared with signed-in players who reply: {email}.',
  noContactEmail:
    'Your account has no email address usable as a contact: add one to your profile to publish a post.',
  publish: 'Publish the post',
  update: 'Update',
  edit: 'Edit',
  cancelEdit: 'Cancel',
  close: 'Close the post',
  closeConfirmTitle: 'Close the recruitment post?',
  closeConfirmSubtitle:
    'It disappears from the Recruitment page and the directory. You can publish a new one at any time.',
  closeConfirmYes: 'Close',
  closeConfirmNo: 'Keep the post',
  saving: 'Saving…',
  published: 'Post published.',
  updated: 'Post updated.',
  closed: 'Post closed.',
  saveError: 'Unable to save the post.',
  closeError: 'Unable to close the post.',
  loadError: 'Unable to load the post.',
  errorRoles: 'Pick at least one role.',
  viewPublic: 'See the Recruitment page',
  viewProfile: "See {name}'s profile (rank, heroes, history)",
  discordHandle: 'Discord: {handle}',
  rejectConfirmTitle: "Decline {name}'s request?",
  rejectConfirmWithReason: 'The reason you entered will be shown to them.',
  rejectConfirmNoReason:
    'No reason will be shown to them. You can type one in the field provided before declining.',
  rejectConfirmNo: 'Cancel',
};
