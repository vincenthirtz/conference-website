// lib/i18n/locales/en/actualitesPage.ts
//
// Traductions ANGLAISES du namespace `actualitesPage`.
//
// La SOURCE DE VERITE est le francais (`../fr/actualitesPage.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  badgePatch: 'Patch Notes',
  readDetails: 'Read the details',
  categoryFallback: 'News',
  readArticle: 'Read the article',
  headerEyebrow: 'Blizzard news',
  headerTitle: 'Overwatch news',
  headerSubtitle:
    'Patch notes, updates and official game news, straight from Blizzard.',
  siteNewsLink: 'See the site news',
  tabAll: 'All',
  tabPatch: 'Patch Notes',
  tabNews: 'News',
  loadError:
    'Unable to load Blizzard news at the moment. Try again in a few moments.',
  empty: 'No news available at the moment.',
  allPatchNotes: 'All Patch Notes',
  allNews: 'All News',
};
