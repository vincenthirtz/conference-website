// lib/i18n/locales/en/lorePage.ts
//
// Traductions ANGLAISES du namespace `lorePage`.
//
// La SOURCE DE VERITE est le francais (`../fr/lorePage.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: 'Overwatch Lore & Media | OW World Cup',
  headDesc:
    'Explore the world of Overwatch: comics, short stories, music and official artwork from Blizzard.',
  eyebrow: 'Universe & Lore',
  title: 'Overwatch media',
  intro:
    "Dive into the world of Overwatch with Blizzard's official comics, short stories, music and artwork.",
  labelComic: 'Comic',
  labelStory: 'Short story',
  labelMusic: 'Music',
  labelScreenshot: 'Artwork',
  tabAll: 'All',
  tabComic: 'Comics',
  tabStory: 'Stories',
  tabMusic: 'Music',
  tabScreenshot: 'Artwork',
  partsCount: '{count} parts',
  ctaComic: 'Read the comic',
  ctaStory: 'Read the story',
  ctaMusic: 'Listen',
  ctaScreenshot: 'View the artwork',
  empty: 'No media available right now.',
  viewAllBlizzard: 'See all media on Blizzard',
};
