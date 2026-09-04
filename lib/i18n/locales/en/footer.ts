// lib/i18n/locales/en/footer.ts
//
// Traductions ANGLAISES du namespace `footer`.
//
// La SOURCE DE VERITE est le francais (`../fr/footer.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  tagline:
    'The 100% women, French-speaking Overwatch tournament. Community, competition, kindness.',
  colTournament: 'Tournament',
  colCommunity: 'Community',
  colLegal: 'Legal & contact',
  ambassadors: 'Ambassadors',
  rules: 'Rules',
  news: 'OW news',
  sitemap: 'Sitemap',
  about: 'About',
  installApp: 'Install the app',
  donate: 'Make a donation',
  support: 'Report / Support',
  organisers: 'Run a tournament',
  contact: 'Contact us',
  legal: 'Legal notice',
  copyright: "WOMEN'S CUP association — All rights reserved — Made with ❤️ by",
  leaderboard: 'Player rankings',
  palmares: 'Hall of fame',
};
