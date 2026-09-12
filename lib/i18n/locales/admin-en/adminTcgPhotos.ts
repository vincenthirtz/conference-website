// lib/i18n/locales/admin-en/adminTcgPhotos.ts
//
// Traductions ANGLAISES du namespace `adminTcgPhotos`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTcgPhotos.ts`) : toute
// cle ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans
// quoi le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont les
// valeurs sont de type `string`.

export default {
  tabLabel: 'TCG photos',
  heading: 'Card photos to review',
  subtitle:
    'Photos submitted by players for their card. Until a photo is approved, the card stays without an image.',

  empty: 'No photo awaiting review.',
  loading: 'Loading…',
  loadError: 'Could not load the queue.',

  submittedAt: 'Submitted on {date}',
  viewProfile: 'View profile',

  approve: 'Approve',
  reject: 'Decline',
  reasonPlaceholder: 'Reason for declining (optional, shown to the player)',

  approved: 'Photo approved.',
  rejected: 'Photo declined.',

  rejectHint:
    'Declining deletes the file: it will no longer be reachable by URL. The player keeps the reason and can submit again.',

  conflict:
    'This photo is no longer pending — the player may have removed it. The list has been refreshed.',
  error: 'Action failed for now.',
};
