// lib/i18n/locales/en/homeNews.ts
//
// Traductions ANGLAISES du namespace `homeNews`.
//
// La SOURCE DE VERITE est le francais (`../fr/homeNews.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  eyebrow: 'News',
  title: "Latest OW Women's Cup news",
  subtitle: "The tournament's official announcements, published by the staff.",
  filterByTag: 'Filter by tag',
  filterAll: 'All',
  emptyAll: 'No news for now. Check back soon!',
  emptyCategory: 'No news in this category for now.',
  featured: 'Featured',
  comments_one: '{count} comment',
  comments_other: '{count} comments',
  readArticle: 'Read the article',
  allNews: 'All news',
  excerptFallback: 'Discover the latest tournament updates.',
};
