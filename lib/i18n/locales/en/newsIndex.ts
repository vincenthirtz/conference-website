// lib/i18n/locales/en/newsIndex.ts
//
// Traductions ANGLAISES du namespace `newsIndex`.
//
// La SOURCE DE VERITE est le francais (`../fr/newsIndex.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  readArticle: 'Read the article',
  headerEyebrow: 'The blog',
  headerTitle: 'Site news',
  headerSubtitleBefore:
    "Announcements, behind the scenes and news from the OW Women's Cup. For patch notes and official Overwatch news, head to the ",
  headerSubtitleLink: 'Overwatch news',
  headerSubtitleAfter: ' page.',
  loadError: 'Unable to load news at the moment. Try again in a few moments.',
  empty: 'No news published yet. Come back soon!',
  loadMore: 'See more news',
};
