// lib/i18n/locales/en/error404.ts
//
// Traductions ANGLAISES du namespace `error404`.
//
// La SOURCE DE VERITE est le francais (`../fr/error404.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: "Page not found | OW Women's Cup",
  metaDescription:
    'The page you are looking for does not exist or has been moved.',
  heading: 'This page left the match',
  body: "The link may be broken, the page may have moved, or you found an easter egg. No panic — we'll get you back to the lobby.",
  backHome: 'Back to home',
  previousPage: 'Previous page',
  explore: 'Or explore from here',
  sHome: 'Home',
  sTournament: 'Tournament',
  sAmbassadors: 'Ambassadors',
  sNews: 'News',
  sSitemap: 'Sitemap',
  sContact: 'Contact',
  reportPrefix: 'Expected something else?',
  reportLink: 'Let us know',
};
