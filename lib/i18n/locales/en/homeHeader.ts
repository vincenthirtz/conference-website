// lib/i18n/locales/en/homeHeader.ts
//
// Traductions ANGLAISES du namespace `homeHeader`.
//
// La SOURCE DE VERITE est le francais (`../fr/homeHeader.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  subtitle1: 'The 100% women, French-speaking Overwatch tournament.',
  subtitle2: 'Join the community and show your level!',
  ctaRegister: 'Register my team',
  ctaDiscord: 'Join the Discord',
  navAria: 'Useful links',
  navFaq: 'FAQ',
  navRoadmap: 'Roadmap',
  navScrim: 'Scrim',
};
