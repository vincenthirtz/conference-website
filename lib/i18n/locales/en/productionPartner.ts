// lib/i18n/locales/en/productionPartner.ts
//
// Traductions ANGLAISES du namespace `productionPartner`.
//
// La SOURCE DE VERITE est le francais (`../fr/productionPartner.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  eyebrow: 'Production & broadcast',
  title: 'POGTV runs the 2026 Cup broadcast',
  body: 'The 2026 matches are produced and broadcast by POGTV, a studio specialising in inclusive esports events and shows. Control room, overlays and directing are in professional hands — so the players can just play.',
  role: 'Partner production studio',
  compactLabel: 'Broadcast produced by',
  logoAlt: 'POGTV logo',
  twitchCta: 'Twitch channel',
  instagramCta: 'Instagram',
  linkAria: 'POGTV on {network} (new tab)',
};
