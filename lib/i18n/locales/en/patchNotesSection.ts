// lib/i18n/locales/en/patchNotesSection.ts
//
// Traductions ANGLAISES du namespace `patchNotesSection`.
//
// La SOURCE DE VERITE est le francais (`../fr/patchNotesSection.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  errLoad: 'Unable to load patch notes at the moment.',
  unavailable: 'Unable to display the latest update notes right now.',
  checkOfficial: 'Check them directly on the official site.',
  seePatchNotes: 'See the patch notes',
  patchNotesLabel: 'Patch notes',
  readOn: 'Read on overwatch.blizzard.com',
  eyebrow: 'News',
  title: 'Overwatch patch notes',
  subtitle:
    "The latest official Overwatch updates, up to date straight from Blizzard's site.",
  seeMore: 'See more',
  categoryFallback: 'Other updates',
};
