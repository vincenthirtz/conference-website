// lib/i18n/locales/en/pressSection.ts
//
// Traductions ANGLAISES du namespace `pressSection`.
//
// La SOURCE DE VERITE est le francais (`../fr/pressSection.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  eyebrow: 'Press',
  title: 'They talk about us',
  subtitle: "Browse the articles and media covering the OW Women's Cup.",
  readArticle: 'Read the article',
};
